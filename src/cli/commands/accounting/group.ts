import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        description: 'Accounting / bookkeeping utilities',
        name: 'accounting',
    },
    subCommands: {
        'audit-mutations': async () => {
            const commandModule = await import('./audit-mutations/command');
            return commandModule.default;
        },
    },
});
