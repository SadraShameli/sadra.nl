import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import DrawdownDurationPanel from '~/app/(app)/prop-calculator/_components/DrawdownDurationPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { type SimOutputs, simulate } from '~/lib/prop-calculator';

import { statStripCaption } from './statStripValue';

const UNDERWATER_LABEL = 'Time underwater';
const RECOVERY_LABEL = 'Avg recovery time';
const V_SHAPE_LABEL = 'V-shape episodes';

const UNDERWATER_DEFINITION = 'avg % of days below peak';
const RECOVERY_DEFINITION = 'from trough to new peak';
const V_SHAPE_DEFINITION = 'fast recovery (< 40% of dur.)';

function risingFrom(start: number, length: number): number[] {
    return Array.from({ length }, (_, index) => start + index);
}

const SLOW_DEEP_CURVE = [
    100, 50, 60, 70, 80, 90, 95, 99, 99.5, 99.9, 99.95, 99.99, 100.5,
];

const QUICK_V_CURVE = [100, 99, 98, 97, 96, 95, ...risingFrom(101, 24)];

const MIXED_CURVE = [
    100,
    99,
    98,
    97,
    96,
    90,
    101,
    100,
    100.2,
    100.4,
    100.6,
    100.8,
    100.9,
    101.5,
    ...risingFrom(102, 26),
];

const NEVER_RECOVERED_CURVE = [100, 90, 80, 70];

describe('DrawdownDurationPanel grades time underwater, recovery time and V-shape share in words, not colour (wave 7 review)', () => {
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

    function render(curve: readonly number[]): void {
        const result: SimOutputs = {
            ...base,
            sampleEquityCurves: [[...curve]],
        };
        act(() => {
            root.render(<DrawdownDurationPanel result={result} />);
        });
    }

    function captionOf(label: string): string | undefined {
        return statStripCaption(container, label)?.textContent;
    }

    it('calls a long, slow, deep drawdown prolonged, slow and mostly slow', () => {
        render(SLOW_DEEP_CURVE);
        expect(captionOf(UNDERWATER_LABEL)).toBe(
            `${UNDERWATER_DEFINITION} · prolonged`,
        );
        expect(captionOf(RECOVERY_LABEL)).toBe(`${RECOVERY_DEFINITION} · slow`);
        expect(captionOf(V_SHAPE_LABEL)).toBe(
            `${V_SHAPE_DEFINITION} · mostly slow`,
        );
    });

    it('calls a short dip that snaps back brief, fast and mostly fast', () => {
        render(QUICK_V_CURVE);
        expect(captionOf(UNDERWATER_LABEL)).toBe(
            `${UNDERWATER_DEFINITION} · brief`,
        );
        expect(captionOf(RECOVERY_LABEL)).toBe(`${RECOVERY_DEFINITION} · fast`);
        expect(captionOf(V_SHAPE_LABEL)).toBe(
            `${V_SHAPE_DEFINITION} · mostly fast`,
        );
    });

    it('calls one quick and one slow recovery moderate and mixed', () => {
        render(MIXED_CURVE);
        expect(captionOf(UNDERWATER_LABEL)).toBe(
            `${UNDERWATER_DEFINITION} · moderate`,
        );
        expect(captionOf(RECOVERY_LABEL)).toBe(
            `${RECOVERY_DEFINITION} · moderate`,
        );
        expect(captionOf(V_SHAPE_LABEL)).toBe(`${V_SHAPE_DEFINITION} · mixed`);
    });

    it('grades no recovery when no drawdown ever recovered, leaving only the definitions', () => {
        render(NEVER_RECOVERED_CURVE);
        expect(captionOf(UNDERWATER_LABEL)).toBe(
            `${UNDERWATER_DEFINITION} · prolonged`,
        );
        expect(captionOf(RECOVERY_LABEL)).toBe(RECOVERY_DEFINITION);
        expect(captionOf(V_SHAPE_LABEL)).toBe(V_SHAPE_DEFINITION);
    });
});
