import { defineCommand, runMain } from 'citty';

const main = defineCommand({
    meta: {
        description: 'sadra.nl developer CLI',
        name: 'cli',
        version: '1.0.0',
    },
    subCommands: {
        seed: () => import('./commands/seed/group').then((m) => m.default),
    },
});

await runMain(main);
