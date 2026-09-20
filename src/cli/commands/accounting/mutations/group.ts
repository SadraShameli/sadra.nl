import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        description: 'List, inspect, and manually create eBoekhouden mutations',
        name: 'mutations',
    },
    subCommands: {
        add: async () => {
            const commandModule = await import('./add/command');
            return commandModule.default;
        },
        ledgers: async () => {
            const commandModule = await import('./ledgers/command');
            return commandModule.default;
        },
        list: async () => {
            const commandModule = await import('./list/command');
            return commandModule.default;
        },
        show: async () => {
            const commandModule = await import('./show/command');
            return commandModule.default;
        },
    },
});
