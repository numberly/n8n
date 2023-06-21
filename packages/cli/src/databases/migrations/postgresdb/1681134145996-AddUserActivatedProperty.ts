import type { MigrationContext, ReversibleMigration } from '@db/types';
import type { UserSettings } from '@/Interfaces';

export class AddUserActivatedProperty1681134145996 implements ReversibleMigration {
	async up({ tablePrefix, executeQuery }: MigrationContext) {
		const activatedUsers: UserSettings[] = await executeQuery(
			`SELECT DISTINCT sw."userId" AS id,
				JSONB_SET(COALESCE(u.settings::jsonb, '{}'), '{userActivated}', 'true', true) as settings
			FROM  ${tablePrefix}workflow_statistics ws
						JOIN ${tablePrefix}shared_workflow sw
							ON ws."workflowId" = sw."workflowId"
						JOIN ${tablePrefix}role r
							ON r.id = sw."roleId"
						JOIN "${tablePrefix}user" u
							ON u.id = sw."userId"
			WHERE ws.name = 'production_success'
						AND r.name = 'owner'
						AND r.scope = 'workflow'`,
		);

		await Promise.all(
			activatedUsers.map(async (user) =>
				executeQuery(`UPDATE "${tablePrefix}user" SET settings = :settings WHERE id = :id `, {
					settings: JSON.stringify(user.settings),
					id: user.id,
				}),
			),
		);

		if (!activatedUsers.length) {
			await executeQuery(
				`UPDATE "${tablePrefix}user" SET settings = JSONB_SET(COALESCE(settings::jsonb, '{}'), '{userActivated}', 'false', true)`,
			);
		} else {
			await executeQuery(
				`UPDATE "${tablePrefix}user" SET settings = JSONB_SET(COALESCE(settings::jsonb, '{}'), '{userActivated}', 'false', true) WHERE id NOT IN :userIds`,
				{ userIds: activatedUsers.map(({ id }) => id) },
			);
		}
	}

	async down({ tablePrefix, executeQuery }: MigrationContext) {
		await executeQuery(
			`UPDATE "${tablePrefix}user" SET settings = settings::jsonb - 'userActivated'`,
		);
		await executeQuery(
			`UPDATE "${tablePrefix}user" SET settings = NULL WHERE settings::jsonb = '{}'::jsonb`,
		);
	}
}
