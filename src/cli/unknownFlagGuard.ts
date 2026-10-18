import type { ArgDef, ArgsDef, CommandDef, Resolvable } from 'citty';

declare module 'citty' {
    interface CommandMeta {
        readonly knownUnsupportedFlags?: readonly KnownUnsupportedFlag[];
    }
}

export interface KnownUnsupportedFlag {
    readonly name: string;
    readonly takesValue: boolean;
}

export interface UnknownFlagIssue {
    readonly commandPath: string;
    readonly flag: string;
    readonly suggestion: null | string;
}

const BUILTIN_FLAG_NAMES = new Set(['h', 'help', 'v', 'version']);
const NEGATION_PREFIX = 'no-';
const SUGGESTION_DISTANCE_DIVISOR = 3;

export async function findUnknownFlag(
    rawArgs: readonly string[],
    root: CommandDef,
    rootName: string,
): Promise<null | UnknownFlagIssue> {
    return walkCommand(root, rootName, [...rawArgs]);
}

export function unknownFlagMessage(issue: UnknownFlagIssue): string {
    const suggestion =
        issue.suggestion === null
            ? ''
            : ` The closest declared flag is --${issue.suggestion}.`;
    return `Unknown flag ${issue.flag} for "${issue.commandPath}".${suggestion}`;
}

function acceptedFlagNames(
    argsDef: ArgsDef,
    knownUnsupportedFlags: readonly KnownUnsupportedFlag[],
): Set<string> {
    const names = new Set<string>();
    for (const [name, def] of Object.entries(argsDef)) {
        if (def.type === 'positional') continue;
        names.add(name);
        names.add(toCamelCase(name));
        names.add(toKebabCase(name));
        for (const alias of argAlias(def)) names.add(alias);
    }
    for (const { name } of knownUnsupportedFlags) {
        names.add(name);
        names.add(toCamelCase(name));
        names.add(toKebabCase(name));
    }
    return names;
}

function argAlias(def: ArgDef): string[] {
    return 'alias' in def ? toAliasArray(def.alias) : [];
}

function closestDeclaredFlag(flag: string, argsDef: ArgsDef): null | string {
    let best: null | string = null;
    let bestDistance = Infinity;
    for (const [name, def] of Object.entries(argsDef)) {
        if (def.type === 'positional') continue;
        const distance = levenshteinDistance(flag, name);
        const threshold = Math.max(
            1,
            Math.floor(
                Math.max(flag.length, name.length) /
                    SUGGESTION_DISTANCE_DIVISOR,
            ),
        );
        if (distance > threshold || distance >= bestDistance) continue;
        bestDistance = distance;
        best = name;
    }
    return best;
}

function findSubCommandTokenIndex(
    rawArgs: readonly string[],
    argsDef: ArgsDef,
    knownUnsupportedFlags: readonly KnownUnsupportedFlag[],
): number {
    for (let index = 0; index < rawArgs.length; index++) {
        const token = rawArgs[index];
        if (token === undefined || token === '--') return -1;
        if (token.startsWith('-')) {
            if (
                !token.includes('=') &&
                isValueFlag(token, argsDef, knownUnsupportedFlags)
            )
                index++;
            continue;
        }
        return index;
    }
    return -1;
}

function findUnknownFlagInLeafArgs(
    rawArgs: readonly string[],
    argsDef: ArgsDef,
    commandPath: string,
    knownUnsupportedFlags: readonly KnownUnsupportedFlag[],
): null | UnknownFlagIssue {
    const accepted = acceptedFlagNames(argsDef, knownUnsupportedFlags);
    for (let index = 0; index < rawArgs.length; index++) {
        const token = rawArgs[index];
        if (token === undefined || token === '--') break;
        if (!token.startsWith('-')) continue;
        const dashes = token.startsWith('--') ? '--' : '-';
        const withoutDashes = token.slice(dashes.length);
        const [rawName] = withoutDashes.split('=', 1);
        if (rawName === undefined || rawName === '') continue;
        const isNegation = rawName.startsWith(NEGATION_PREFIX);
        const lookupName = isNegation
            ? rawName.slice(NEGATION_PREFIX.length)
            : rawName;
        if (
            BUILTIN_FLAG_NAMES.has(lookupName) ||
            accepted.has(lookupName) ||
            accepted.has(toCamelCase(lookupName)) ||
            accepted.has(toKebabCase(lookupName))
        ) {
            if (
                !token.includes('=') &&
                isValueFlag(token, argsDef, knownUnsupportedFlags)
            )
                index++;
            continue;
        }
        return {
            commandPath,
            flag: `${dashes}${withoutDashes}`,
            suggestion: closestDeclaredFlag(lookupName, argsDef),
        };
    }
    return null;
}

function isValueFlag(
    flag: string,
    argsDef: ArgsDef,
    knownUnsupportedFlags: readonly KnownUnsupportedFlag[],
): boolean {
    const name = flag.replace(/^-{1,2}/, '');
    const normalized = toCamelCase(name);
    for (const [key, def] of Object.entries(argsDef)) {
        if (def.type !== 'string' && def.type !== 'enum') continue;
        if (normalized === toCamelCase(key) || argAlias(def).includes(name)) {
            return true;
        }
    }
    for (const spec of knownUnsupportedFlags) {
        if (spec.takesValue && normalized === toCamelCase(spec.name)) {
            return true;
        }
    }
    return false;
}

function levenshteinDistance(a: string, b: string): number {
    const distances: number[][] = Array.from(
        { length: a.length + 1 },
        (_, row) =>
            Array.from({ length: b.length + 1 }, (_, col) =>
                row === 0 ? col : col === 0 ? row : 0,
            ),
    );
    for (let row = 1; row <= a.length; row++) {
        for (let col = 1; col <= b.length; col++) {
            const cost = a[row - 1] === b[col - 1] ? 0 : 1;
            const current = distances[row];
            const previous = distances[row - 1];
            if (current === undefined || previous === undefined) continue;
            const deletionCost = (previous[col] ?? Infinity) + 1;
            const insertionCost = (current[col - 1] ?? Infinity) + 1;
            const substitutionCost = (previous[col - 1] ?? Infinity) + cost;
            current[col] = Math.min(
                deletionCost,
                insertionCost,
                substitutionCost,
            );
        }
    }
    return distances[a.length]?.[b.length] ?? Infinity;
}

async function resolveOptional<T>(
    value: Resolvable<T> | undefined,
): Promise<T | undefined> {
    if (value === undefined) return undefined;
    return typeof value === 'function'
        ? (value as () => Promise<T> | T)()
        : value;
}

function toAliasArray(alias: string | string[] | undefined): string[] {
    if (alias === undefined) return [];
    return Array.isArray(alias) ? alias : [alias];
}

function toCamelCase(name: string): string {
    return name.replaceAll(/[-_](\w)/g, (_, char: string) =>
        char.toUpperCase(),
    );
}

function toKebabCase(name: string): string {
    return name
        .replaceAll(/([a-z\d])([A-Z])/g, '$1-$2')
        .replaceAll(/[_\s]+/g, '-')
        .toLowerCase();
}

async function walkCommand(
    root: CommandDef,
    rootName: string,
    rawArgs: string[],
): Promise<null | UnknownFlagIssue> {
    let cmd = root;
    let commandPath = rootName;
    let remainingArgs = rawArgs;
    for (;;) {
        const subCommands = await resolveOptional(cmd.subCommands);
        const argsDef = (await resolveOptional(cmd.args)) ?? {};
        const meta = await resolveOptional(cmd.meta);
        const knownUnsupportedFlags = meta?.knownUnsupportedFlags ?? [];
        if (
            subCommands === undefined ||
            Object.keys(subCommands).length === 0
        ) {
            return findUnknownFlagInLeafArgs(
                remainingArgs,
                argsDef,
                commandPath,
                knownUnsupportedFlags,
            );
        }
        const index = findSubCommandTokenIndex(
            remainingArgs,
            argsDef,
            knownUnsupportedFlags,
        );
        const leadingIssue = findUnknownFlagInLeafArgs(
            index === -1 ? remainingArgs : remainingArgs.slice(0, index),
            argsDef,
            commandPath,
            knownUnsupportedFlags,
        );
        if (leadingIssue !== null || index === -1) return leadingIssue;
        const name = remainingArgs[index];
        if (name === undefined) return null;
        const subCommand = subCommands[name];
        if (subCommand === undefined) return null;
        const resolved = await resolveOptional(subCommand);
        if (resolved === undefined) return null;
        cmd = resolved;
        commandPath += ` ${name}`;
        remainingArgs = remainingArgs.slice(index + 1);
    }
}
