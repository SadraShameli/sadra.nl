import { defineCommand, runMain } from 'citty';

import { ui } from '~/cli/ui';
import { findUnknownFlag, unknownFlagMessage } from '~/cli/unknownFlagGuard';

export const main = defineCommand({
    meta: {
        description: 'CLI',
        name: 'cli',
        version: '1.0.0',
    },
    subCommands: {
        accounting: async () => {
            const commandModule = await import('./commands/accounting/group');
            return commandModule.default;
        },
        prop: async () => {
            const commandModule = await import('./commands/prop/group');
            return commandModule.default;
        },
        seed: async () => {
            const commandModule = await import('./commands/seed/group');
            return commandModule.default;
        },
    },
});

const isEntryPoint: unknown = Reflect.get(import.meta, 'main');

if (isEntryPoint === true) {
    const rawArgs = process.argv.slice(2);
    const unknownFlag = await findUnknownFlag(rawArgs, main, 'cli');
    if (unknownFlag === null) {
        await runMain(main);
    } else {
        ui.fail(unknownFlagMessage(unknownFlag));
        process.exitCode = 1;
    }
}
