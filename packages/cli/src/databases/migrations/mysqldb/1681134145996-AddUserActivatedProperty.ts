import type { MigrationContext, ReversibleMigration } from '@db/types';
import type { UserSettings } from '@/Interfaces';

export class AddUserActivatedProperty1681134145996 implements ReversibleMigration {
	async up({ tablePrefix, executeQuery }: MigrationContext) {
		const activatedUsers: UserSettings[] = await executeQuery(
			`SELECT DISTINCT sw.userId AS id,
				JSON_SET(COALESCE(u.settings, '{}'), '$.userActivated', true) AS settings
			FROM ${tablePrefix}workflow_statistics AS ws
						JOIN ${tablePrefix}shared_workflow as sw
							ON ws.workflowId = sw.workflowId
						JOIN ${tablePrefix}role AS r
							ON r.id = sw.roleId
						JOIN ${tablePrefix}user AS u
							ON u.id = sw.userId
			WHERE ws.name = 'production_success'
						AND r.name = 'owner'
						AND r.scope = 'workflow'`,
		);

		await Promise.all(
			activatedUsers.map(async (user) =>
				executeQuery(`UPDATE ${tablePrefix}user SET settings = :settings WHERE id = :id `, {
					// MariaDB returns settings as a string and MySQL as a JSON
					settings:
						typeof user.settings === 'string' ? user.settings : JSON.stringify(user.settings),
					id: user.id,
				}),
			),
		);

		if (!activatedUsers.length) {
			await executeQuery(
				`UPDATE ${tablePrefix}user SET settings = JSON_SET(COALESCE(settings, '{}'), '$.userActivated', false)`,
			);
		} else {
			await executeQuery(
				`UPDATE ${tablePrefix}user SET settings = JSON_SET(COALESCE(settings, '{}'), '$.userActivated', false) WHERE id NOT IN :userIds`,
				{ userIds: activatedUsers.map(({ id }) => id) },
			);
		}
	}

	async down({ tablePrefix, executeQuery }: MigrationContext) {
		await executeQuery(
			`UPDATE ${tablePrefix}user SET settings = JSON_REMOVE(settings, '$.userActivated')`,
		);
		await executeQuery(`UPDATE ${tablePrefix}user SET settings = NULL WHERE settings = '{}'`);
	}
}
