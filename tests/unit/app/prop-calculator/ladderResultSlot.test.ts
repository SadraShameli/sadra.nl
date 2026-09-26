import { describe, expect, it } from 'vitest';

import {
    applyPolicy,
    describeLadderSlot,
    isSlotApplicable,
    isSlotWriteAllowed,
    ladderInputsKey,
    type LadderResultSlot,
    LadderSlotEvent,
    ladderSlotFor,
    restoreForm,
} from '~/app/(app)/prop-calculator/_components/ladderResultSlot';
import {
    type LadderProgress,
    LadderRunPhase,
    type LadderSearchInputs,
    type LadderSearchRun,
    type LadderSearchState,
} from '~/app/(app)/prop-calculator/_components/ladderSearchTypes';
import {
    ALL_FIRMS,
    ApexVariant,
    type CouponDiscounts,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    type LadderScore,
    percent,
    type Plan,
    PolicySizing,
    RungSizing,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function apexPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function otherPlan(): Plan {
    const plan = findFirm(FirmId.Tpt)?.plans[0];
    if (!plan) throw new Error('Take Profit Trader has no plan');
    return plan;
}

const discounts: CouponDiscounts = {
    activationPercent: percent(0),
    bundlePercent: percent(0),
    evalPercent: percent(10),
    monthlySubscriptionPercent: percent(0),
    resetPercent: percent(0),
};

const baseInputs: LadderSearchInputs = {
    commission: 4,
    copyAccounts: 1,
    discounts,
    grid: { lo: 100, max: 1000, slots: 4, step: 100 },
    instrument: InstrumentSymbol.NQ,
    maxDays: 60,
    plan: apexPlan(),
    rrRatio: 2,
    rungSizing: RungSizing.CapToCushion,
    seed: 42,
    sims: 4000,
    stopPoints: 10,
    stopRule: { kind: DayStopRuleKind.DayGreen },
    winrate: 0.4,
};

const progress: LadderProgress = {
    completed: 40,
    elapsedMs: 1200,
    etaMs: 3000,
    total: 120,
};

const score: LadderScore = {
    costPerFunded: 900,
    costPerFundedStandardError: 20,
    expectedDaysToFunded: 12,
    expectedDaysToFundedStandardError: 0.5,
    ladder: [200, 300, 400, 100],
    meanDaysOnFail: 5,
    meanDaysOnPass: 9,
    passRate: 0.4,
    passRateStandardError: 0.01,
};

const run: LadderSearchRun = {
    byCost: [score],
    byPassRate: [score],
    bySpeed: [score],
    droppedAliasCount: 0,
    frontier: [score],
    gridSize: 1,
    laddersScored: 1,
    unscorableCount: 0,
};

const succeeded: LadderSearchState = {
    phase: LadderRunPhase.Succeeded,
    progress,
    result: run,
};
const running: LadderSearchState = { phase: LadderRunPhase.Running, progress };
const cancelled: LadderSearchState = {
    phase: LadderRunPhase.Cancelled,
    progress,
};

function completedSlot(
    inputs: LadderSearchInputs = baseInputs,
): LadderResultSlot {
    const slot = ladderSlotFor(
        LadderSlotEvent.Completed,
        succeeded,
        inputs,
        InstrumentSymbol.ES,
    );
    if (!slot) throw new Error('expected a slot');
    return slot;
}

const FIELD_CHANGES: readonly [string, LadderSearchInputs][] = [
    ['commission', { ...baseInputs, commission: 5 }],
    ['copyAccounts', { ...baseInputs, copyAccounts: 3 }],
    ['discounts: absent', { ...baseInputs, discounts: undefined }],
    [
        'discounts.activationPercent',
        {
            ...baseInputs,
            discounts: { ...discounts, activationPercent: percent(5) },
        },
    ],
    [
        'discounts.bundlePercent',
        {
            ...baseInputs,
            discounts: { ...discounts, bundlePercent: percent(5) },
        },
    ],
    [
        'discounts.evalPercent',
        {
            ...baseInputs,
            discounts: { ...discounts, evalPercent: percent(20) },
        },
    ],
    [
        'discounts.monthlySubscriptionPercent',
        {
            ...baseInputs,
            discounts: {
                ...discounts,
                monthlySubscriptionPercent: percent(5),
            },
        },
    ],
    [
        'discounts.resetPercent',
        {
            ...baseInputs,
            discounts: { ...discounts, resetPercent: percent(5) },
        },
    ],
    ['grid.lo', { ...baseInputs, grid: { ...baseInputs.grid, lo: 150 } }],
    ['grid.max', { ...baseInputs, grid: { ...baseInputs.grid, max: 900 } }],
    ['grid.slots', { ...baseInputs, grid: { ...baseInputs.grid, slots: 3 } }],
    ['grid.step', { ...baseInputs, grid: { ...baseInputs.grid, step: 50 } }],
    ['instrument', { ...baseInputs, instrument: InstrumentSymbol.MNQ }],
    ['instrument: none', { ...baseInputs, instrument: undefined }],
    ['maxDays', { ...baseInputs, maxDays: 30 }],
    ['plan', { ...baseInputs, plan: otherPlan() }],
    ['rrRatio', { ...baseInputs, rrRatio: 1.5 }],
    [
        'rungSizing',
        { ...baseInputs, rungSizing: RungSizing.SkipIfUnaffordable },
    ],
    ['seed', { ...baseInputs, seed: 43 }],
    ['sims', { ...baseInputs, sims: 2000 }],
    ['stopPoints', { ...baseInputs, stopPoints: 12 }],
    ['stopPoints: none', { ...baseInputs, stopPoints: undefined }],
    [
        'stopRule kind',
        { ...baseInputs, stopRule: { kind: DayStopRuleKind.FirstWin } },
    ],
    [
        'stopRule parameter',
        {
            ...baseInputs,
            stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        },
    ],
    ['winrate', { ...baseInputs, winrate: 0.45 }],
];

describe('ladderInputsKey', () => {
    it('is stable for equal inputs', () => {
        expect(ladderInputsKey({ ...baseInputs })).toBe(
            ladderInputsKey(baseInputs),
        );
        expect(
            ladderInputsKey({ ...baseInputs, grid: { ...baseInputs.grid } }),
        ).toBe(ladderInputsKey(baseInputs));
    });

    it('covers every LadderSearchInputs field', () => {
        const covered = new Set(
            FIELD_CHANGES.map(([name]) => name.split(/[.: ]/, 1)[0] ?? name),
        );
        expect([...covered].toSorted(byName)).toEqual(
            Object.keys(baseInputs).toSorted(byName),
        );
    });

    it.each(FIELD_CHANGES)('changes when %s changes', (_name, changed) => {
        expect(ladderInputsKey(changed)).not.toBe(ladderInputsKey(baseInputs));
    });

    it('changes when only the plan opt-ins change', () => {
        const plan = ALL_FIRMS.flatMap((firm) => firm.plans).find(
            (p) => p.fundedReset !== null,
        );
        if (!plan) throw new Error('no plan offers a funded reset');
        expect(
            ladderInputsKey({
                ...baseInputs,
                plan: withPlanOptIns(plan, {
                    takesFundedReset: true,
                    takesOneTimeEarlyWithdrawal: false,
                }),
            }),
        ).not.toBe(ladderInputsKey({ ...baseInputs, plan }));
    });
});

describe('ladder result slot', () => {
    it('stores the result, the full inputs and the display instrument', () => {
        const slot = completedSlot();
        expect(slot.result).toBe(succeeded);
        expect(slot.inputs).toBe(baseInputs);
        expect(slot.inputs.stopPoints).toBe(10);
        expect(slot.displayInstrument).toBe(InstrumentSymbol.ES);
        expect(slot.cancelledByNavigation).toBe(false);
        expect(describeLadderSlot(slot)).toBeNull();
    });

    it('applies only to inputs with the same key', () => {
        const slot = completedSlot();
        expect(isSlotApplicable(slot, { ...baseInputs })).toBe(true);
        expect(isSlotApplicable(slot, { ...baseInputs, stopPoints: 11 })).toBe(
            false,
        );
        expect(isSlotApplicable(slot, { ...baseInputs, winrate: 0.41 })).toBe(
            false,
        );
    });

    it('restores the stored form fields and the display instrument', () => {
        const slot = completedSlot({
            ...baseInputs,
            grid: { lo: 50, max: 800, slots: 3, step: 25 },
            rungSizing: RungSizing.SkipIfUnaffordable,
            sims: 1234,
            stopRule: { dollars: 600, kind: DayStopRuleKind.AfterTarget },
        });
        expect(restoreForm(slot)).toEqual({
            displayInstrument: InstrumentSymbol.ES,
            grid: { lo: 50, max: 800, slots: 3, step: 25 },
            rungSizing: RungSizing.SkipIfUnaffordable,
            sims: 1234,
            stopRule: { dollars: 600, kind: DayStopRuleKind.AfterTarget },
        });
    });

    it('applies a row under the stored stop rule, not a form default', () => {
        const slot = completedSlot({
            ...baseInputs,
            stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        });
        const policy = applyPolicy(slot, score);
        expect(policy).toEqual({
            ladder: [200, 300, 400, 100],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        });
        expect(policy.ladder).not.toBe(score.ladder);
    });

    it('keeps a run interrupted by navigation as Cancelled with its progress', () => {
        const slot = ladderSlotFor(
            LadderSlotEvent.Unmounted,
            running,
            baseInputs,
            '',
        );
        expect(slot).toEqual({
            cancelledByNavigation: true,
            displayInstrument: '',
            inputs: baseInputs,
            result: { phase: LadderRunPhase.Cancelled, progress },
        });
        if (!slot) throw new Error('expected a slot');
        expect(describeLadderSlot(slot)).toBe('Search cancelled by navigation');
    });

    it('keeps a user cancel as Cancelled without blaming navigation', () => {
        const slot = ladderSlotFor(
            LadderSlotEvent.Cancelled,
            cancelled,
            baseInputs,
            InstrumentSymbol.NQ,
        );
        expect(slot?.result).toEqual({
            phase: LadderRunPhase.Cancelled,
            progress,
        });
        expect(slot?.cancelledByNavigation).toBe(false);
        if (!slot) throw new Error('expected a slot');
        expect(describeLadderSlot(slot)).toBe('Search cancelled');
    });

    it('keeps a finished result on unmount', () => {
        const slot = ladderSlotFor(
            LadderSlotEvent.Unmounted,
            succeeded,
            baseInputs,
            InstrumentSymbol.NQ,
        );
        expect(slot?.result).toBe(succeeded);
        expect(slot?.cancelledByNavigation).toBe(false);
    });

    it('writes nothing for a progress update, an idle or a failed search', () => {
        expect(
            ladderSlotFor(LadderSlotEvent.Progress, running, baseInputs, ''),
        ).toBeNull();
        expect(
            ladderSlotFor(
                LadderSlotEvent.Unmounted,
                { phase: LadderRunPhase.Idle },
                baseInputs,
                '',
            ),
        ).toBeNull();
        expect(
            ladderSlotFor(
                LadderSlotEvent.Completed,
                { phase: LadderRunPhase.Failed, reason: 'x' },
                baseInputs,
                '',
            ),
        ).toBeNull();
    });

    it('writes nothing when the event does not match the phase', () => {
        expect(
            ladderSlotFor(LadderSlotEvent.Completed, running, baseInputs, ''),
        ).toBeNull();
        expect(
            ladderSlotFor(LadderSlotEvent.Cancelled, succeeded, baseInputs, ''),
        ).toBeNull();
    });
});

describe('isSlotWriteAllowed', () => {
    it.each([
        [LadderSlotEvent.Completed, true],
        [LadderSlotEvent.Cancelled, true],
        [LadderSlotEvent.Unmounted, true],
        [LadderSlotEvent.Progress, false],
    ])('%s gives %s', (event, expected) => {
        expect(isSlotWriteAllowed(event)).toBe(expected);
    });
});
