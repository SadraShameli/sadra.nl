import { type ArgsDef, type CommandDef, renderUsage } from 'citty';

const NAMED_FLAG = /(?<![\w-])--([a-z][\w-]*[a-z\d])/g;

export async function flagsNamedButNotAccepted<T extends ArgsDef>(
    command: CommandDef<T>,
): Promise<string[]> {
    const usage = await renderUsage(command);
    const accepted = new Set(Object.keys(await acceptedArguments(command)));
    const named = new Set(
        usage.matchAll(NAMED_FLAG).map(([, flag]) => flag ?? ''),
    );
    return [...named]
        .filter((flag) => !accepted.has(flag))
        .toSorted((a, b) => a.localeCompare(b));
}

async function acceptedArguments<T extends ArgsDef>(
    command: CommandDef<T>,
): Promise<ArgsDef> {
    const { args } = command;
    if (args === undefined) return {};
    return typeof args === 'function' ? await args() : await args;
}
