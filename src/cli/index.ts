import { defineCommand, runMain } from 'citty';

const main = defineCommand({
    meta: {
        description: 'CLI',
        name: 'cli',
        version: '1.0.0',
    },
    subCommands: {
        accounting: async () => {
            const commandModule = await import('./commands/accounting/group');
            return commandModule.default;
        },
        seed: async () => {
            const commandModule = await import('./commands/seed/group');
            return commandModule.default;
        },
    },
});

await runMain(main);
