import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { simulatorHref } from '~/app/(app)/prop-calculator/_components/simulatorHref';
import {
    encodeState,
    ObjectiveUrlMode,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { routes } from '~/lib/site/routes';

const SRC_ROOT = path.join(process.cwd(), 'src');
const CALCULATOR_ROOT = path.join(SRC_ROOT, 'app', '(app)', 'prop-calculator');
const BUILDER_FILE = path.join(
    CALCULATOR_ROOT,
    '_components',
    'simulatorHref.ts',
);
const CALLERS = [
    path.join(CALCULATOR_ROOT, '_components', 'useOpenInSimulator.tsx'),
    path.join(
        CALCULATOR_ROOT,
        'accounts',
        '_components',
        'calculatorLinkForAccount.ts',
    ),
];
const SIMULATOR_TEMPLATE =
    /\$\{(?:routes\.propCalculator\.simulator|target)\}\?\$\{/;
const SOURCE_FILE = /\.tsx?$/;

function relative(files: readonly string[]): string[] {
    return files
        .map((file) => path.relative(SRC_ROOT, file))
        .toSorted((a, b) => a.localeCompare(b));
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? full : [];
    });
}

describe('one simulator href builder (PT-111, F-33 (4))', () => {
    it('writes the simulator route, a question mark and the encoded state in simulatorHref only', () => {
        const writers = sourceFiles(CALCULATOR_ROOT).filter((file) =>
            SIMULATOR_TEMPLATE.test(readFileSync(file, 'utf8')),
        );
        expect(relative(writers)).toEqual(relative([BUILDER_FILE]));
    });

    it.each(CALLERS.map((file) => path.relative(SRC_ROOT, file)))(
        '%s builds its href through simulatorHref',
        (file) => {
            const source = readFileSync(path.join(SRC_ROOT, file), 'utf8');
            expect(source).toMatch(/\bsimulatorHref\(/);
            expect(source).not.toMatch(/\}\?\$\{encodeState\(/);
        },
    );

    it('is the simulator route with the encoded state as its query', () => {
        const state = { ...defaultCalculatorState(), rebuyLagDays: 2.5 };
        expect(simulatorHref(state)).toBe(
            `${routes.propCalculator.simulator}?${encodeState(state).toString()}`,
        );
    });

    it('passes the encode options through', () => {
        const state = defaultCalculatorState();
        const options = { objectiveUrl: ObjectiveUrlMode.Explicit };
        expect(simulatorHref(state, options)).toBe(
            `${routes.propCalculator.simulator}?${encodeState(state, options).toString()}`,
        );
        expect(simulatorHref(state, options)).not.toBe(simulatorHref(state));
    });
});
