import { defineCommand } from 'citty';

const group = defineCommand({
    meta: {
        description: 'tweakcn theme catalog commands',
        name: 'themes',
    },
    subCommands: {
        sync: async () => {
            const commandModule = await import('./sync/command');
            return commandModule.default;
        },
    },
});

export default group;
