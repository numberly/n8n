import type { Logger } from '@/Logger';
import type { INodeTypes } from 'n8n-workflow';
import type { QueryRunner, ObjectLiteral } from 'typeorm';

export type DatabaseType = 'mariadb' | 'postgresdb' | 'mysqldb' | 'sqlite';

export interface MigrationContext {
	logger: Logger;
	queryRunner: QueryRunner;
	tablePrefix: string;
	dbType: DatabaseType;
	isMysql: boolean;
	dbName: string;
	migrationName: string;
	nodeTypes: INodeTypes;
	loadSurveyFromDisk(): string | null;
	parseJson<T>(data: string | T): T;
	escape: {
		columnName(name: string): string;
		tableName(name: string): string;
		indexName(name: string): string;
	};
	executeQuery<T>(
		sql: string,
		unsafeParameters?: ObjectLiteral,
		nativeParameters?: ObjectLiteral,
	): Promise<T>;
	runInBatches<T>(
		query: string,
		operation: (results: T[]) => Promise<void>,
		limit?: number,
	): Promise<void>;
}

type MigrationFn = (ctx: MigrationContext) => Promise<void>;

export interface ReversibleMigration {
	up: MigrationFn;
	down: MigrationFn;
}

export interface IrreversibleMigration {
	up: MigrationFn;
	down?: never;
}

export interface Migration extends Function {
	prototype: ReversibleMigration | IrreversibleMigration;
}

export type InsertResult = Array<{ insertId: number }>;
