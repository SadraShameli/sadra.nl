import { defineCommand } from 'citty';

const group = defineCommand({
    meta: {
        description: 'Database seeding commands',
        name: 'seed',
    },
    subCommands: {
        list: async () => {
            const commandModule = await import('./list/command');
            return commandModule.default;
        },
        run: async () => {
            const commandModule = await import('./run/command');
            return commandModule.default;
        },
    },
});

export default group;
