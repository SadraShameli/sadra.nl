import { customType } from 'drizzle-orm/pg-core';

export const bytea = customType<{
    data: Buffer;
    default: false;
    notNull: false;
}>({
    dataType() {
        return 'bytea';
    },
});

export abstract class DatabaseSeeder {
    abstract readonly name: string;
    readonly priority: number = 100;

    abstract run(): Promise<void>;
}

export class SeederRegistry {
    private readonly seeders: DatabaseSeeder[] = [];

    names(): string[] {
        return this.seeders.map((s) => s.name);
    }

    register(seeder: DatabaseSeeder): this {
        if (this.seeders.some((s) => s.name === seeder.name)) {
            throw new Error(
                `Seeder with name "${seeder.name}" is already registered`,
            );
        }
        this.seeders.push(seeder);
        return this;
    }

    registerAll(seeders: readonly DatabaseSeeder[]): this {
        for (const seeder of seeders) this.register(seeder);
        return this;
    }

    select(filter?: (seeder: DatabaseSeeder) => boolean): DatabaseSeeder[] {
        const selected = filter
            ? this.seeders.filter((s) => filter(s))
            : [...this.seeders];
        return selected.toSorted((a, b) => a.priority - b.priority);
    }
}
