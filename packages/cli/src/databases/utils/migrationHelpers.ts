import { Container } from 'typedi';
import { readFileSync, rmSync } from 'fs';
import { UserSettings } from 'n8n-core';
import type { ObjectLiteral } from 'typeorm';
import type { QueryRunner } from 'typeorm/query-runner/QueryRunner';
import config from '@/config';
import { getLogger } from '@/Logger';
import { inTest } from '@/constants';
import type { Migration, MigrationContext } from '@db/types';
import { NodeTypes } from '@/NodeTypes';

const logger = getLogger();

const PERSONALIZATION_SURVEY_FILENAME = 'personalizationSurvey.json';

function loadSurveyFromDisk(): string | null {
	const userSettingsPath = UserSettings.getUserN8nFolderPath();
	try {
		const filename = `${userSettingsPath}/${PERSONALIZATION_SURVEY_FILENAME}`;
		const surveyFile = readFileSync(filename, 'utf-8');
		rmSync(filename);
		const personalizationSurvey = JSON.parse(surveyFile) as object;
		const kvPairs = Object.entries(personalizationSurvey);
		if (!kvPairs.length) {
			throw new Error('personalizationSurvey is empty');
		} else {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			const emptyKeys = kvPairs.reduce((acc, [_key, value]) => {
				if (!value || (Array.isArray(value) && !value.length)) {
					return acc + 1;
				}
				return acc;
			}, 0);
			if (emptyKeys === kvPairs.length) {
				throw new Error('incomplete personalizationSurvey');
			}
		}
		return surveyFile;
	} catch (error) {
		return null;
	}
}

let logFinishTimeout: NodeJS.Timeout;

function logMigrationStart(migrationName: string, disableLogging = inTest): void {
	if (disableLogging) return;

	if (!logFinishTimeout) {
		logger.warn('Migrations in progress, please do NOT stop the process.');
	}

	logger.debug(`Starting migration ${migrationName}`);

	clearTimeout(logFinishTimeout);
}

function logMigrationEnd(migrationName: string, disableLogging = inTest): void {
	if (disableLogging) return;

	logger.debug(`Finished migration ${migrationName}`);

	logFinishTimeout = setTimeout(() => {
		logger.warn('Migrations finished.');
	}, 100);
}

const dbType = config.getEnv('database.type');
const isMysql = ['mariadb', 'mysqldb'].includes(dbType);
const dbName = config.getEnv(`database.${dbType === 'mariadb' ? 'mysqldb' : dbType}.database`);
const tablePrefix = config.getEnv('database.tablePrefix');

function parseJson<T>(data: string | T): T {
	return typeof data === 'string'
		? // eslint-disable-next-line n8n-local-rules/no-uncaught-json-parse
		  (JSON.parse(data) as T)
		: data;
}

const createContext = (queryRunner: QueryRunner, migration: Migration): MigrationContext => ({
	logger,
	tablePrefix,
	dbType,
	isMysql,
	dbName,
	migrationName: migration.name,
	queryRunner,
	nodeTypes: Container.get(NodeTypes),
	loadSurveyFromDisk,
	parseJson,
	escape: {
		columnName: (name) => queryRunner.connection.driver.escape(name),
		tableName: (name) => queryRunner.connection.driver.escape(`${tablePrefix}${name}`),
		indexName: (name) => queryRunner.connection.driver.escape(`IDX_${tablePrefix}${name}`),
	},
	executeQuery: async <T>(
		sql: string,
		unsafeParameters?: ObjectLiteral,
		safeParameters?: ObjectLiteral,
	) => {
		if (unsafeParameters) {
			const [query, parameters] = queryRunner.connection.driver.escapeQueryWithParameters(
				sql,
				unsafeParameters,
				safeParameters ?? {},
			);
			return queryRunner.query(query, parameters) as Promise<T>;
		} else {
			return queryRunner.query(sql) as Promise<T>;
		}
	},
	runInBatches: async <T>(
		query: string,
		operation: (results: T[]) => Promise<void>,
		limit = 100,
	) => {
		let offset = 0;
		let batchedQuery: string;
		let batchedQueryResults: T[];

		// eslint-disable-next-line no-param-reassign
		if (query.trim().endsWith(';')) query = query.trim().slice(0, -1);

		do {
			batchedQuery = `${query} LIMIT ${limit} OFFSET ${offset}`;
			batchedQueryResults = (await queryRunner.query(batchedQuery)) as T[];
			// pass a copy to prevent errors from mutation
			await operation([...batchedQueryResults]);
			offset += limit;
		} while (batchedQueryResults.length === limit);
	},
});

export const wrapMigration = (migration: Migration) => {
	const { up, down } = migration.prototype;
	Object.assign(migration.prototype, {
		async up(queryRunner: QueryRunner) {
			logMigrationStart(migration.name);
			await up.call(this, createContext(queryRunner, migration));
			logMigrationEnd(migration.name);
		},
		async down(queryRunner: QueryRunner) {
			await down?.call(this, createContext(queryRunner, migration));
		},
	});
};
