import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        description:
            'Prop-firm calculator: plan rules, simulations and ladder search',
        name: 'prop',
    },
    subCommands: {
        compare: async () => {
            const commandModule = await import('./compare/command');
            return commandModule.default;
        },
        ladder: async () => {
            const commandModule = await import('./ladder/command');
            return commandModule.default;
        },
        plans: async () => {
            const commandModule = await import('./plans/command');
            return commandModule.default;
        },
        sim: async () => {
            const commandModule = await import('./sim/command');
            return commandModule.default;
        },
    },
});
