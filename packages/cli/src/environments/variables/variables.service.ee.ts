import type { Variables } from '@/databases/entities/Variables';
import { collections } from '@/Db';
import { InternalHooks } from '@/InternalHooks';
import Container from 'typedi';
import { canCreateNewVariable } from './enviromentHelpers';
import { VariablesService } from './variables.service';
import { generateId } from '@db/utils/generators';

export class VariablesLicenseError extends Error {}
export class VariablesValidationError extends Error {}

export class EEVariablesService extends VariablesService {
	static async getCount(): Promise<number> {
		return collections.Variables.count();
	}

	static validateVariable(variable: Omit<Variables, 'id'>): void {
		if (variable.key.length > 50) {
			throw new VariablesValidationError('key cannot be longer than 50 characters');
		}
		if (variable.key.replace(/[A-Za-z0-9_]/g, '').length !== 0) {
			throw new VariablesValidationError('key can only contain characters A-Za-z0-9_');
		}
		if (variable.value.length > 255) {
			throw new VariablesValidationError('value cannot be longer than 255 characters');
		}
	}

	static async create(variable: Omit<Variables, 'id'>): Promise<Variables> {
		if (!canCreateNewVariable(await this.getCount())) {
			throw new VariablesLicenseError('Variables limit reached');
		}
		this.validateVariable(variable);

		void Container.get(InternalHooks).onVariableCreated({ variable_type: variable.type });
		return collections.Variables.save({
			...variable,
			id: generateId(),
		});
	}

	static async update(id: string, variable: Omit<Variables, 'id'>): Promise<Variables> {
		this.validateVariable(variable);
		await collections.Variables.update(id, variable);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return (await this.get(id))!;
	}
}
