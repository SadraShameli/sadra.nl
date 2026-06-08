import { defineCommand } from 'citty';

import { ui } from '~/cli/ui';
import { endDb } from '~/server/db';
import { seeders } from '~/server/db/seeds';
import { SeederRegistry } from '~/server/db/types';

export default defineCommand({
    meta: {
        description: 'List all registered seeders, grouped by prefix',
        name: 'list',
    },
    async run() {
        try {
            const registry = new SeederRegistry().registerAll(seeders);
            const names = registry
                .names()
                .toSorted((a, b) => a.localeCompare(b));

            let group = '';
            for (const name of names) {
                const next = name.split(':', 1)[0] ?? name;
                if (next !== group) {
                    ui.heading(next);
                    group = next;
                }
                ui.note(name);
            }
            ui.muted(`\n${names.length} seeder(s)`);
        } finally {
            await endDb();
        }
    },
});
