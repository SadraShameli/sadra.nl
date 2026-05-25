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

export type SeederLogger = (line: string) => void;

export interface SeederRunReport {
    results: SeederRunResult[];
    totalDurationMs: number;
}

interface SeederRunResult {
    durationMs: number;
    error?: string;
    name: string;
    status: SeederStatus;
}

type SeederStatus = 'failed' | 'ok' | 'skipped';

export abstract class DatabaseSeeder {
    abstract readonly name: string;
    readonly priority: number = 100;

    abstract run(): Promise<void>;
}

const defaultLogger: SeederLogger = (line) => {
    console.log(line);
};

export class SeederRegistry {
    private readonly logger: SeederLogger;
    private readonly seeders: DatabaseSeeder[] = [];

    constructor(logger: SeederLogger = defaultLogger) {
        this.logger = logger;
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

    async runAll(): Promise<SeederRunReport> {
        const ordered = [...this.seeders].toSorted(
            (a, b) => a.priority - b.priority,
        );
        const results: SeederRunResult[] = [];
        const overallStartMs = performance.now();

        for (const seeder of ordered) {
            const startedAtMs = performance.now();
            this.logger(`▶ ${seeder.name}`);
            try {
                await seeder.run();
                const durationMs = performance.now() - startedAtMs;
                results.push({
                    durationMs,
                    name: seeder.name,
                    status: 'ok',
                });
                this.logger(`✓ ${seeder.name} (${durationMs.toFixed(0)} ms)`);
            } catch (error) {
                const durationMs = performance.now() - startedAtMs;
                const message =
                    error instanceof Error ? error.message : String(error);
                results.push({
                    durationMs,
                    error: message,
                    name: seeder.name,
                    status: 'failed',
                });
                this.logger(`✗ ${seeder.name} — ${message}`);
                throw error;
            }
        }

        return {
            results,
            totalDurationMs: performance.now() - overallStartMs,
        };
    }
}
