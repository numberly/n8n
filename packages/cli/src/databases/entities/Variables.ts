import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { generateId } from '../utils/generators';

@Entity()
export class Variables {
	constructor(data?: Partial<Variables>) {
		Object.assign(this, data);
		if (!this.id) {
			this.id = generateId();
		}
	}

	@BeforeInsert()
	generateId() {
		if (!this.id) {
			this.id = generateId();
		}
	}

	@PrimaryColumn('varchar')
	id: string;

	@Column('text')
	key: string;

	@Column('text', { default: 'string' })
	type: string;

	@Column('text')
	value: string;
}
