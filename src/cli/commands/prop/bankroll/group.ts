import { defineCommand } from 'citty';

const group = defineCommand({
    meta: {
        description:
            'Bankroll engine path: risk, projections, compares, batches, levers and the spend-vs-payout curve',
        name: 'bankroll',
    },
    subCommands: {
        batch: async () => {
            const commandModule = await import('./batch');
            return commandModule.default;
        },
        compare: async () => {
            const commandModule = await import('./compare');
            return commandModule.default;
        },
        curve: async () => {
            const commandModule = await import('./curve');
            return commandModule.default;
        },
        levers: async () => {
            const commandModule = await import('./levers');
            return commandModule.default;
        },
        project: async () => {
            const commandModule = await import('./project');
            return commandModule.default;
        },
        risk: async () => {
            const commandModule = await import('./risk');
            return commandModule.default;
        },
    },
});

export default group;
