import * as clack from '@clack/prompts';
import { defineCommand } from 'citty';

import type { DatabaseSeeder } from '~/server/db/types';

import { ui } from '~/cli/ui';
import { endDb } from '~/server/db';
import { seeders } from '~/server/db/seeds';
import { SeederRegistry } from '~/server/db/types';

const tokenMatches = (name: string, token: string): boolean =>
    name === token || name.startsWith(`${token}:`);

export default defineCommand({
    args: {
        interactive: {
            alias: 'i',
            default: false,
            description: 'Pick seeders to run interactively',
            type: 'boolean',
        },
    },
    meta: {
        description:
            'Run database seeders. Pass names or group prefixes (e.g. "iot" or "accounting:rules"); omit to run all.',
        name: 'run',
    },
    async run(context) {
        const registry = new SeederRegistry().registerAll(seeders);
        const names = registry.names();
        const tokens = context.args._.filter((a) => a.length > 0);

        let filter: ((s: DatabaseSeeder) => boolean) | undefined;

        if (
            context.args.interactive ||
            (tokens.length === 0 && process.stdout.isTTY)
        ) {
            const picked = await clack.multiselect({
                message: 'Select seeders to run',
                options: names.map((name) => ({ label: name, value: name })),
                required: true,
            });
            if (clack.isCancel(picked)) {
                ui.warn('Cancelled.');
                return;
            }
            const chosen = new Set(picked);
            filter = (s) => chosen.has(s.name);
        } else if (tokens.length > 0) {
            const unmatched = tokens.filter((t) =>
                names.every((n) => !tokenMatches(n, t)),
            );
            if (unmatched.length > 0) {
                ui.fail(`No seeders match: ${unmatched.join(', ')}`);
                ui.muted(`Available: ${names.join(', ')}`);
                process.exitCode = 1;
                return;
            }
            filter = (s) => tokens.some((t) => tokenMatches(s.name, t));
        }

        const selected = registry.select(filter);
        ui.heading(`Running ${selected.length} seeder(s)`);
        const startedAll = performance.now();
        try {
            for (const seeder of selected) {
                const spinner = ui.spinner(seeder.name).start();
                const started = performance.now();
                try {
                    await seeder.run();
                    const ms = (performance.now() - started).toFixed(0);
                    spinner.succeed(`${seeder.name} (${ms}ms)`);
                } catch (error) {
                    spinner.fail(seeder.name);
                    ui.fail(
                        error instanceof Error ? error.message : String(error),
                    );
                    process.exitCode = 1;
                    return;
                }
            }
            const total = ((performance.now() - startedAll) / 1000).toFixed(2);
            ui.success(`Done — ${selected.length} seeder(s) in ${total}s`);
        } finally {
            await endDb();
        }
    },
});
