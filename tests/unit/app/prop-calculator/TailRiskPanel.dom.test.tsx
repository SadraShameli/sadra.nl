import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import TailRiskPanel from '~/app/(app)/prop-calculator/_components/TailRiskPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { type SimOutputs, simulate } from '~/lib/prop-calculator';

import { statStripCaption, statStripValue } from './statStripValue';

const TAIL_RATIO_LABEL = 'Tail ratio';

const TRIALS_PER_SIDE = 50;

const DOWNSIDE_LOSS = 1000;

function resultWithUpsideGain(base: SimOutputs, gain: number): SimOutputs {
    return {
        ...base,
        finalBalances: [
            ...Array.from(
                { length: TRIALS_PER_SIDE },
                () => base.accountSize - DOWNSIDE_LOSS,
            ),
            ...Array.from(
                { length: TRIALS_PER_SIDE },
                () => base.accountSize + gain,
            ),
        ],
    };
}

describe('TailRiskPanel grades the tail ratio in words, not colour (wave 7 review)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const base = simulate(
        buildSimInputs({ ...defaultCalculatorState(), trials: 200 }),
    );

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function render(result: SimOutputs): void {
        act(() => {
            root.render(<TailRiskPanel result={result} />);
        });
    }

    it.each([
        { bench: 'healthy', gain: 3000, ratio: '3.00' },
        { bench: 'marginal', gain: 1200, ratio: '1.20' },
        { bench: 'downside-heavy', gain: 600, ratio: '0.60' },
    ])(
        'reads a $ratio tail ratio as $bench beside its definition',
        ({ bench, gain, ratio }) => {
            render(resultWithUpsideGain(base, gain));
            expect(
                statStripValue(container, TAIL_RATIO_LABEL)?.textContent,
            ).toBe(ratio);
            expect(
                statStripCaption(container, TAIL_RATIO_LABEL)?.textContent,
            ).toBe(`upside / downside tail · ${bench}`);
        },
    );
});

function figureLines(cell: HTMLElement | undefined): string[] {
    const figure = cell?.querySelector('span');
    return [...(figure?.children ?? [])].map((line) => line.textContent);
}

function repeated(count: number, balance: number): number[] {
    return Array.from({ length: count }, () => balance);
}

function resultWithOutcomes(
    base: SimOutputs,
    outcomes: readonly { count: number; share: number }[],
): SimOutputs {
    return {
        ...base,
        finalBalances: outcomes.flatMap(({ count, share }) =>
            repeated(count, base.accountSize * (1 + share)),
        ),
    };
}

function scenarioCells(scope: ParentNode, label: string): HTMLElement[] {
    const row = [
        ...scope.querySelectorAll(
            ':scope .app-prop-calculator__tail-risk-table tbody tr',
        ),
    ].find((candidate) => candidate.firstElementChild?.textContent === label);
    return [...(row?.querySelectorAll<HTMLElement>('td') ?? [])];
}

describe('TailRiskPanel grades P(loss) and P(gain) in words, not colour (wave 8)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const base = simulate(
        buildSimInputs({ ...defaultCalculatorState(), trials: 200 }),
    );

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function render(result: SimOutputs): void {
        act(() => {
            root.render(<TailRiskPanel result={result} />);
        });
    }

    it('writes a grade word under each probability', () => {
        render(
            resultWithOutcomes(base, [
                { count: 5, share: -0.6 },
                { count: 15, share: -0.3 },
                { count: 10, share: -0.15 },
                { count: 10, share: 0 },
                { count: 30, share: 0.15 },
                { count: 30, share: 0.3 },
            ]),
        );
        const [, lossAt10, gainAt10] = scenarioCells(
            container,
            'Lose 10% of capital',
        );
        const [, lossAt25, gainAt25] = scenarioCells(
            container,
            'Lose 25% of capital',
        );
        const [, lossAt50] = scenarioCells(container, 'Lose 50% of capital');
        expect(figureLines(lossAt10)).toStrictEqual(['30.0%', 'high']);
        expect(figureLines(lossAt25)).toStrictEqual(['20.0%', 'moderate']);
        expect(figureLines(lossAt50)).toStrictEqual(['5.0%', 'low']);
        expect(figureLines(gainAt10)).toStrictEqual(['60.0%', 'strong']);
        expect(figureLines(gainAt25)).toStrictEqual(['30.0%', 'fair']);
    });

    it('calls a gain no trial reached slim and leaves the unmeasured 50% gain without a grade', () => {
        render(resultWithOutcomes(base, [{ count: 100, share: -0.05 }]));
        const [, lossAt10, gainAt10] = scenarioCells(
            container,
            'Lose 10% of capital',
        );
        const gainAt50 = scenarioCells(container, 'Lose 50% of capital')[2];
        expect(figureLines(lossAt10)).toStrictEqual(['0.0%', 'low']);
        expect(figureLines(gainAt10)).toStrictEqual(['0.0%', 'slim']);
        expect(gainAt50?.textContent).not.toMatch(/slim|fair|strong/);
    });
});
