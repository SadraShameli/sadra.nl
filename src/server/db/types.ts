import { customType } from 'drizzle-orm/pg-core';

export const bytea = customType<{
    data: Buffer;
    notNull: false;
    default: false;
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

    abstract run(): Promise<void>;

    static async runAll() {
        for (const seed of DatabaseSeeder.seeds) {
            await seed.run();
        }
    }
}
