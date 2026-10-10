import { defineCommand } from 'citty';

const group = defineCommand({
    meta: {
        description: 'Accounting / bookkeeping utilities',
        name: 'accounting',
    },
    subCommands: {
        'audit-mutations': async () => {
            const commandModule = await import('./audit-mutations/command');
            return commandModule.default;
        },
        mutations: async () => {
            const commandModule = await import('./mutations/group');
            return commandModule.default;
        },
    },
});

export default group;
