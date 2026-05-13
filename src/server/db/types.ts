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
    static seeds: DatabaseSeeder[] = [];

    constructor() {
        DatabaseSeeder.seeds.push(this);
    }

    static async runAll() {
        for (const seed of DatabaseSeeder.seeds) {
            await seed.run();
        }
    }

    abstract run(): Promise<void>;
}
