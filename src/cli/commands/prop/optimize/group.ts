import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        description: 'Optimize prop-firm plan policies',
        name: 'optimize',
    },
    subCommands: {
        funded: async () => {
            const commandModule = await import('./funded/command');
            return commandModule.default;
        },
    },
});
