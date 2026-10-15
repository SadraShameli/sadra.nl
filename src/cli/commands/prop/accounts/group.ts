import { defineCommand } from 'citty';

const group = defineCommand({
    meta: {
        description: 'Your tracked prop accounts',
        name: 'accounts',
    },
    subCommands: {
        add: async () => {
            const commandModule = await import('./add/command');
            return commandModule.default;
        },
    },
});

export default group;
