import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.join(process.cwd(), 'src');
const CALCULATOR_ROOT = path.join(SRC_ROOT, 'app', '(app)', 'prop-calculator');
const COMPONENTS_ROOT = path.join(CALCULATOR_ROOT, '_components');
const HOOK_FILE = path.join(COMPONENTS_ROOT, 'useToolRulebook.ts');
const PROVIDER_FILE = path.join(COMPONENTS_ROOT, 'CalculatorProvider.tsx');
const TOOLS_ROOT = path.join(CALCULATOR_ROOT, '(tools)');
const OBJECTIVE_CHIP_FILE = path.join(COMPONENTS_ROOT, 'ObjectiveChip.tsx');
const COMPARE_VIEW_FILE = path.join(TOOLS_ROOT, 'compare', 'CompareView.tsx');
const GATED_RULEBOOK_QUERY =
    /rulebook\.get\.useQuery\(\s*undefined,\s*\{\s*enabled/;
const BANKROLL_SUMMARY_QUERY = /bankroll\.summary\.useQuery\(/;
const CHOSEN_AUTOMATICALLY = 'Chosen automatically: your available bankroll ${';
const SOURCE_FILE = /\.tsx?$/;

const textByFile = new Map<string, string>();

function countIn(file: string, pattern: RegExp | string): number {
    const text = textOf(file);
    return typeof pattern === 'string'
        ? text.split(pattern).length - 1
        : text.matchAll(new RegExp(pattern.source, 'g')).toArray().length;
}

function relative(files: readonly string[]): string[] {
    return files
        .map((file) => path.relative(SRC_ROOT, file))
        .toSorted((left, right) => left.localeCompare(right));
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

function textOf(file: string): string {
    const cached = textByFile.get(file);
    if (cached !== undefined) return cached;
    const text = readFileSync(file, 'utf8');
    textByFile.set(file, text);
    return text;
}

const TOOL_SOURCE_FILES = [
    ...sourceFiles(COMPONENTS_ROOT),
    ...sourceFiles(TOOLS_ROOT),
];

describe('the anonymous-tools rulebook rule lives in one place (PT-112, F-155)', () => {
    it('runs the session-gated rulebook query only inside useToolRulebook', () => {
        const writers = TOOL_SOURCE_FILES.filter(
            (file) => countIn(file, GATED_RULEBOOK_QUERY) > 0,
        );
        expect(relative(writers)).toEqual(relative([HOOK_FILE]));
        expect(countIn(HOOK_FILE, GATED_RULEBOOK_QUERY)).toBe(1);
    });

    it('runs one bankroll summary query among the tool views and the provider', () => {
        const writers = [...sourceFiles(TOOLS_ROOT), PROVIDER_FILE].filter(
            (file) => countIn(file, BANKROLL_SUMMARY_QUERY) > 0,
        );
        expect(relative(writers)).toEqual(relative([PROVIDER_FILE]));
        expect(countIn(PROVIDER_FILE, BANKROLL_SUMMARY_QUERY)).toBe(1);
    });

    it('writes the chosen-automatically sentence once, in ObjectiveChip', () => {
        const writers = TOOL_SOURCE_FILES.filter(
            (file) => countIn(file, CHOSEN_AUTOMATICALLY) > 0,
        );
        expect(relative(writers)).toEqual(relative([OBJECTIVE_CHIP_FILE]));
        expect(countIn(OBJECTIVE_CHIP_FILE, CHOSEN_AUTOMATICALLY)).toBe(1);
    });

    it('has CompareView take its notes from the shared builder', () => {
        expect(countIn(COMPARE_VIEW_FILE, 'objectiveChoiceNotes(')).toBe(1);
        expect(countIn(COMPARE_VIEW_FILE, 'CENTS_PER_DOLLAR')).toBe(0);
    });
});
