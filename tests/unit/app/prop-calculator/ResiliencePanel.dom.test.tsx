import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ResiliencePanel from '~/app/(app)/prop-calculator/_components/ResiliencePanel';
import {
    FirmId,
    MffuVariant,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function rowOf(container: HTMLElement, streak: number): string {
    return (
        [...container.querySelectorAll(':scope tbody tr')].find((row) =>
            row.textContent.startsWith(`${streak} in a row`),
        )?.textContent ?? ''
    );
}

describe('ResiliencePanel', () => {
    let container: HTMLDivElement;
    let root: Root;

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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function render(
        inputs: SimInputs,
        maxLosingStreakP95?: number,
    ): SimOutputs {
        const simulated = simulate(inputs);
        const result =
            maxLosingStreakP95 === undefined
                ? simulated
                : { ...simulated, maxLosingStreakP95 };
        act(() => {
            root.render(
                <ResiliencePanel baseInputs={inputs} result={result} />,
            );
        });
        return result;
    }

    it('treats losing exactly the drawdown as a bust and keeps the recommended risk above the floor', () => {
        const plan = rapidEodPlan();
        const lossesToFloor = 5;
        const riskPerTrade = plan.drawdown.amount / lossesToFloor;
        render(
            {
                fundedHorizonDays: 30,
                maxEvalDays: 5,
                plan,
                riskPerTrade,
                rrRatio: 2,
                seed: 1,
                tradesPerDay: 1,
                trials: 50,
                winrate: 0.5,
            },
            lossesToFloor,
        );
        expect(rowOf(container, lossesToFloor)).toContain('Bust');
        expect(container.textContent).toContain('at risk');
        expect(container.textContent).toContain('max safe risk is $399.99');
    });

    it('reports the streak probability as unavailable when no trial passed, instead of 0%', () => {
        const plan = rapidEodPlan();
        const result = render({
            fundedHorizonDays: 30,
            maxEvalDays: 5,
            plan,
            riskPerTrade: 200,
            rrRatio: 1,
            seed: 1,
            tradesPerDay: 2,
            trials: 100,
            winrate: 0.05,
        });
        expect(result.tradesPerSuccessfulAttempt).toBe(0);
        expect(rowOf(container, 5)).not.toContain('0.0%');
    });
});
