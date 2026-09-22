import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        description: 'Optimize prop-firm plan policies',
        name: 'optimize',
    },
    subCommands: {
        dp: async () => {
            const commandModule = await import('./dp/command');
            return commandModule.default;
        },
        funded: async () => {
            const commandModule = await import('./funded/command');
            return commandModule.default;
        },
    },
});
