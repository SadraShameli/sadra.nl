import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        description: 'Database seeding commands',
        name: 'seed',
    },
    subCommands: {
        list: () => import('./list/command').then((m) => m.default),
        run: () => import('./run/command').then((m) => m.default),
    },
});
