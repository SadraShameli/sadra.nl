import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    baseSimulationFailure,
    currentBaseFailure,
} from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { InstrumentSymbol, simulate } from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

const BASE_FAILURE_TEXT =
    'The simulation could not run for these inputs, so there is no result to show. Change an input to run it again.';
const COMPONENTS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '_components',
);
const TOOLS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '(tools)',
);
const PAGE_VIEWS = [
    path.join(TOOLS_ROOT, 'simulator', 'SimulatorView.tsx'),
    path.join(TOOLS_ROOT, 'analysis', 'AnalysisView.tsx'),
];

function acceptedInputs() {
    return buildSimInputs(stateWith({}));
}

function importsOf(source: string): { clause: string; specifier: string }[] {
    return source
        .matchAll(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm)
        .map(([, clause = '', specifier = '']) => ({ clause, specifier }))
        .toArray();
}

function refusedInputs() {
    return buildSimInputs(
        stateWith({
            instrument: InstrumentSymbol.NQ,
            riskDollars: 150,
            stopPoints: 10,
        }),
    );
}

function requiredRefusal(): string {
    const refusal = simInputsSizingIssue(refusedInputs());
    if (refusal === null) throw new Error('expected a sizing refusal');
    return refusal;
}

function stateWith(patch: Partial<CalculatorState>): CalculatorState {
    return { ...defaultCalculatorState(), trials: 20, ...patch };
}

describe('currentBaseFailure, the one page failure rule (PT-11h)', () => {
    it('shows nothing while accepted inputs are pending, even with the last run error', () => {
        expect(
            currentBaseFailure(acceptedInputs(), {
                error: 'simulate: an error from the previous inputs',
                isPending: true,
                result: null,
            }),
        ).toBeNull();
    });

    it('shows the engine error text of the current run', () => {
        const message = 'simulate: trials must be a positive safe integer';
        expect(
            currentBaseFailure(acceptedInputs(), {
                error: message,
                isPending: false,
                result: null,
            }),
        ).toBe(message);
    });

    it('shows the generic failure when a settled run gave no result and no error', () => {
        expect(
            currentBaseFailure(acceptedInputs(), {
                error: null,
                isPending: false,
                result: null,
            }),
        ).toBe(BASE_FAILURE_TEXT);
    });

    it('shows nothing once the run for the current inputs has a result', () => {
        const inputs = acceptedInputs();
        expect(
            currentBaseFailure(inputs, {
                error: null,
                isPending: false,
                result: simulate(inputs),
            }),
        ).toBeNull();
    });

    it('shows the sizing refusal at once for refused inputs, pending or settled', () => {
        const refusal = requiredRefusal();
        expect(
            currentBaseFailure(refusedInputs(), {
                error: 'simulate: an error from the previous inputs',
                isPending: true,
                result: null,
            }),
        ).toBe(refusal);
        expect(
            currentBaseFailure(refusedInputs(), {
                error: refusal,
                isPending: false,
                result: null,
            }),
        ).toBe(refusal);
    });

    it.each(PAGE_VIEWS.map((file) => path.relative(TOOLS_ROOT, file)))(
        '%s uses the shared rule instead of its own copy',
        (file) => {
            const source = readFileSync(path.join(TOOLS_ROOT, file), 'utf8');
            expect(source).toMatch(/\bcurrentBaseFailure\(\s*simInputs,/);
            expect(source).not.toContain('isPending ? null : error');
            expect(source).not.toContain('baseSimulationFailure');
        },
    );
});

describe('simulationFailure.ts and useBaseSimulation.ts form no import cycle (PT-11i)', () => {
    const source = readFileSync(
        path.join(COMPONENTS_ROOT, 'simulationFailure.ts'),
        'utf8',
    );

    it('owns baseSimulationFailure next to currentBaseFailure', () => {
        expect(
            baseSimulationFailure(refusedInputs(), {
                isPending: true,
                result: null,
            }),
        ).toBe(requiredRefusal());
        expect(
            baseSimulationFailure(acceptedInputs(), {
                isPending: false,
                result: null,
            }),
        ).toBe(BASE_FAILURE_TEXT);
        expect(
            baseSimulationFailure(acceptedInputs(), {
                isPending: true,
                result: null,
            }),
        ).toBeNull();
        expect(source).toMatch(/export function baseSimulationFailure\(/);
        expect(source).toMatch(/const BASE_SIMULATION_FAILED\s*=/);
    });

    it('imports only types from useBaseSimulation, so no runtime edge points back', () => {
        const edges = importsOf(source).filter(({ specifier }) =>
            specifier.endsWith('/useBaseSimulation'),
        );
        expect(edges.length).toBeGreaterThan(0);
        for (const { clause } of edges) expect(clause).toMatch(/^type\s/);
    });

    it('keeps useBaseSimulation.ts free of its own copy of the failure rule', () => {
        const hook = readFileSync(
            path.join(COMPONENTS_ROOT, 'useBaseSimulation.ts'),
            'utf8',
        );
        expect(hook).not.toContain('BASE_SIMULATION_FAILED');
        expect(hook).not.toMatch(/function baseSimulationFailure\(/);
    });
});
