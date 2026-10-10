import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LadderLabPanel from '~/app/(app)/prop-calculator/_components/LadderLabPanel';
import { ladderSearchInputsFor } from '~/app/(app)/prop-calculator/_components/ladderLabRestore';
import {
    type LadderLabForm,
    type LadderResultSlot,
    LadderSlotEvent,
    ladderSlotFor,
} from '~/app/(app)/prop-calculator/_components/ladderResultSlot';
import {
    type LadderProgress,
    LadderRunPhase,
    type LadderSearchState,
} from '~/app/(app)/prop-calculator/_components/ladderSearchTypes';
import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    type LadderScore,
    type Plan,
    RungSizing,
    type SimInputs,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

interface RestoreHarness {
    ladderSlot: LadderResultSlot | null;
}

const harness = vi.hoisted((): RestoreHarness => ({ ladderSlot: null }));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        dispatch: vi.fn(),
        setRungSizing: vi.fn(),
        writeLadderSlot: vi.fn(),
    }),
    useCalculatorInputs: () => ({ state: { objective: 'monthly-net' } }),
    useLabSlots: () => ({ ladderSlot: harness.ladderSlot }),
    useObjectiveChoice: () => ({ automaticBasis: null, queryFailure: null }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/charts/LadderFrontierChartView',
    () => ({ default: () => null }),
);

function apexPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

const BASE_INPUTS: SimInputs = {
    commissionPerRoundTrip: 4,
    copyAccounts: 1,
    fundedHorizonDays: 60,
    instrument: InstrumentSymbol.NQ,
    maxEvalDays: 60,
    plan: apexPlan(),
    riskPerTrade: 250,
    rrRatio: 2,
    rungSizing: RungSizing.CapToCushion,
    seed: 42,
    stopPoints: 10,
    tradesPerDay: 2,
    trials: 2000,
    winrate: 0.4,
};

const STORED_FORM: LadderLabForm = {
    displayInstrument: InstrumentSymbol.ES,
    grid: { lo: 150, max: 450, slots: 3, step: 50 },
    rungSizing: RungSizing.SkipIfUnaffordable,
    sims: 1234,
    stopRule: { k: 3, kind: DayStopRuleKind.AfterKLosses },
};

const SCORE: LadderScore = {
    costPerFunded: 900,
    costPerFundedStandardError: 20,
    expectedDaysToFunded: 12,
    expectedDaysToFundedStandardError: 0.5,
    ladder: [200, 300, 400],
    meanDaysOnFail: 5,
    meanDaysOnPass: 9,
    passRate: 0.4,
    passRateStandardError: 0.01,
};

const PROGRESS: LadderProgress = {
    completed: 17,
    elapsedMs: 400,
    etaMs: 100,
    total: 40,
};

function searchInputs() {
    return ladderSearchInputsFor(BASE_INPUTS, STORED_FORM);
}

function succeeded(): LadderSearchState {
    return {
        phase: LadderRunPhase.Succeeded,
        progress: { ...PROGRESS, completed: 40 },
        result: {
            byCost: [SCORE],
            byPassRate: [SCORE],
            bySpeed: [SCORE],
            droppedAliasCount: 0,
            frontier: [SCORE],
            gridSize: 40,
            laddersScored: 40,
            unscorableCount: 0,
        },
    };
}

function succeededSlot(): LadderResultSlot {
    const slot = ladderSlotFor(
        LadderSlotEvent.Completed,
        succeeded(),
        searchInputs(),
        STORED_FORM.displayInstrument,
    );
    if (slot === null) throw new Error('no slot');
    return slot;
}

describe('LadderLabPanel restored from the result slot', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(base: SimInputs) {
        act(() => {
            root.render(
                <LadderLabPanel
                    activePolicy={null}
                    baseInputs={base}
                    onApply={vi.fn()}
                />,
            );
        });
    }

    function fieldValue(label: string): string | undefined {
        return [...container.querySelectorAll('label')]
            .find((candidate) => candidate.textContent.startsWith(label))
            ?.querySelector('input')?.value;
    }

    function rowApply(): HTMLButtonElement[] {
        return [...container.querySelectorAll(':scope tbody button')].filter(
            (button): button is HTMLButtonElement =>
                button instanceof HTMLButtonElement &&
                button.textContent === 'Apply',
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.ladderSlot = null;
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

    it('shows the cancelled by navigation notice with the progress and no ranked rows', () => {
        harness.ladderSlot = {
            cancelledByNavigation: true,
            displayInstrument: STORED_FORM.displayInstrument,
            inputs: searchInputs(),
            result: { phase: LadderRunPhase.Cancelled, progress: PROGRESS },
        };
        render(BASE_INPUTS);
        expect(container.textContent).toContain(
            'Search cancelled by navigation after 17 of 40 ladders.',
        );
        expect(container.querySelector('tbody')).toBeNull();
        expect(fieldValue('Sims per ladder')).toBe('1234');
    });

    it('shows the plain cancelled notice when the user cancelled', () => {
        harness.ladderSlot = {
            cancelledByNavigation: false,
            displayInstrument: STORED_FORM.displayInstrument,
            inputs: searchInputs(),
            result: { phase: LadderRunPhase.Cancelled, progress: PROGRESS },
        };
        render(BASE_INPUTS);
        expect(container.textContent).toContain('Search cancelled after 17');
        expect(container.textContent).not.toContain('by navigation');
    });

    it('restores the form, the display instrument and the ranked rows with Apply on', () => {
        harness.ladderSlot = succeededSlot();
        render(BASE_INPUTS);
        expect(fieldValue('Min rung')).toBe('150');
        expect(fieldValue('Max rung')).toBe('450');
        expect(fieldValue('Step')).toBe('50');
        expect(fieldValue('Rungs')).toBe('3');
        expect(fieldValue('Sims per ladder')).toBe('1234');
        expect(
            container.querySelector<HTMLSelectElement>('#ladder-lab-instrument')
                ?.value,
        ).toBe(InstrumentSymbol.ES);
        const rungSizing = [...container.querySelectorAll('label')]
            .find((label) => label.textContent.startsWith('Unaffordable rung'))
            ?.querySelector('select');
        expect(rungSizing?.value).toBe(RungSizing.SkipIfUnaffordable);
        expect(
            container.querySelector('[aria-label="Day stop rule"]')
                ?.textContent,
        ).toContain('K losses');
        expect(container.textContent).toContain('Ranked ladders (1)');
        expect(container.textContent).toContain('Scored 40 distinct ladders');
        expect(container.textContent).not.toContain('Inputs changed');
        expect(rowApply()).toHaveLength(1);
        expect(rowApply()[0]?.disabled).toBe(false);
    });

    it('says the inputs changed and turns Apply off when the calculator inputs moved on', () => {
        harness.ladderSlot = succeededSlot();
        render({ ...BASE_INPUTS, winrate: 0.55 });
        expect(container.textContent).toContain(
            'Inputs changed since this run, so Apply is off.',
        );
        expect(container.textContent).toContain('Ranked ladders (1)');
        expect(rowApply()).toHaveLength(1);
        expect(rowApply()[0]?.disabled).toBe(true);
    });
});
