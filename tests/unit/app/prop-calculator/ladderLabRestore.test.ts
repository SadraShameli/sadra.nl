import { describe, expect, it } from 'vitest';

import {
    displayedLadderSlot,
    initialLadderLabForm,
    isActiveLadderRow,
    labViewForSlot,
    type LadderLabView,
    LadderLabViewKind,
    ladderRowAction,
    LadderRowActionKind,
    ladderSearchInputsFor,
    settledSlotEvent,
} from '~/app/(app)/prop-calculator/_components/ladderLabRestore';
import {
    type LadderLabForm,
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
    ApexVariant,
    type CouponDiscounts,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    defaultLadderGridMax,
    FirmId,
    InstrumentSymbol,
    type LadderScore,
    percent,
    type Plan,
    RungSizing,
    SIM_DEFAULTS,
    type SimInputs,
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

const discounts: CouponDiscounts = {
    activationPercent: percent(0),
    bundlePercent: percent(0),
    evalPercent: percent(10),
    monthlySubscriptionPercent: percent(0),
    resetPercent: percent(0),
};

const form: LadderLabForm = {
    displayInstrument: InstrumentSymbol.ES,
    grid: { lo: 150, max: 900, slots: 3, step: 50 },
    rungSizing: RungSizing.SkipIfUnaffordable,
    sims: 2500,
    stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
};

const simInputs: SimInputs = {
    commissionPerRoundTrip: 4,
    copyAccounts: 2,
    discounts,
    fundedHorizonDays: 90,
    instrument: InstrumentSymbol.NQ,
    maxEvalDays: 60,
    plan: apexPlan(),
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 42,
    stopPoints: 10,
    tradesPerDay: 2,
    trials: 2000,
    winrate: 0.4,
};

const searchInputs: LadderSearchInputs = {
    commission: 4,
    copyAccounts: 2,
    discounts,
    grid: { lo: 150, max: 900, slots: 3, step: 50 },
    instrument: InstrumentSymbol.NQ,
    maxDays: 60,
    plan: simInputs.plan,
    rrRatio: 2,
    rungSizing: RungSizing.SkipIfUnaffordable,
    seed: 42,
    sims: 2500,
    stopPoints: 10,
    stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
    winrate: 0.4,
};

const scoredSizing = searchInputs.rungSizing;

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
    ladder: [200, 300, 400],
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
const idle: LadderSearchState = { phase: LadderRunPhase.Idle };
const failed: LadderSearchState = {
    phase: LadderRunPhase.Failed,
    reason: 'The grid is empty.',
};

function expectKind<Kind extends LadderLabViewKind>(
    view: LadderLabView,
    kind: Kind,
): Extract<LadderLabView, { kind: Kind }> {
    expect(view.kind).toBe(kind);
    return view as Extract<LadderLabView, { kind: Kind }>;
}

function slotFor(
    event: LadderSlotEvent,
    search: LadderSearchState,
    inputs: LadderSearchInputs = searchInputs,
): LadderResultSlot {
    const slot = ladderSlotFor(event, search, inputs, InstrumentSymbol.ES);
    if (!slot) throw new Error('expected a slot');
    return slot;
}

describe('ladderSearchInputsFor', () => {
    it('builds the search inputs from the shared inputs and the lab form', () => {
        expect(ladderSearchInputsFor(simInputs, form)).toEqual(searchInputs);
    });

    it('falls back to the simulation defaults for an unset commission and copy count', () => {
        const inputs = ladderSearchInputsFor(
            {
                ...simInputs,
                commissionPerRoundTrip: undefined,
                copyAccounts: undefined,
            },
            form,
        );
        expect(inputs.commission).toBe(SIM_DEFAULTS.commissionPerRoundTrip);
        expect(inputs.copyAccounts).toBe(SIM_DEFAULTS.copyAccounts);
    });

    it('keeps the sizing instrument and stop points of the shared inputs, not the display instrument', () => {
        const inputs = ladderSearchInputsFor(
            { ...simInputs, instrument: undefined, stopPoints: undefined },
            { ...form, displayInstrument: InstrumentSymbol.MNQ },
        );
        expect(inputs.instrument).toBeUndefined();
        expect(inputs.stopPoints).toBeUndefined();
    });

    it('copies the grid so a later form edit cannot change a stored run', () => {
        const inputs = ladderSearchInputsFor(simInputs, form);
        expect(inputs.grid).not.toBe(form.grid);
    });
});

describe('initialLadderLabForm', () => {
    it('starts from the panel defaults when there is no slot', () => {
        const cushion = simInputs.plan.drawdown.amount;
        expect(
            initialLadderLabForm(null, cushion, RungSizing.CapToCushion),
        ).toEqual({
            displayInstrument: InstrumentSymbol.NQ,
            grid: {
                lo: 100,
                max: defaultLadderGridMax(cushion),
                slots: 4,
                step: 100,
            },
            rungSizing: RungSizing.CapToCushion,
            sims: 4000,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        });
    });

    it.each([RungSizing.SkipIfUnaffordable, RungSizing.CapToCushion])(
        'seeds the rung sizing from the calculator inputs (%s) when there is no slot',
        (rungSizing) => {
            expect(
                initialLadderLabForm(
                    null,
                    simInputs.plan.drawdown.amount,
                    rungSizing,
                ).rungSizing,
            ).toBe(rungSizing);
        },
    );

    it('restores the form fields and the display instrument of a stored slot', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        expect(
            initialLadderLabForm(
                slot,
                simInputs.plan.drawdown.amount,
                RungSizing.CapToCushion,
            ),
        ).toEqual(restoreForm(slot));
        expect(
            initialLadderLabForm(
                slot,
                simInputs.plan.drawdown.amount,
                RungSizing.CapToCushion,
            ),
        ).toEqual(form);
    });

    it('rebuilds the search inputs of a restored slot exactly, so it applies on return', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const restored = initialLadderLabForm(
            slot,
            simInputs.plan.drawdown.amount,
            RungSizing.CapToCushion,
        );
        expect(
            labViewForSlot(slot, ladderSearchInputsFor(simInputs, restored))
                .kind,
        ).toBe(LadderLabViewKind.Restored);
    });
});

describe('labViewForSlot', () => {
    it('is Empty without a slot', () => {
        expect(labViewForSlot(null, searchInputs)).toEqual({
            kind: LadderLabViewKind.Empty,
        });
    });

    it('is Restored with the stored result, form and display instrument when the inputs match', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const view = expectKind(
            labViewForSlot(slot, { ...searchInputs }),
            LadderLabViewKind.Restored,
        );
        expect(view.result).toBe(run);
        expect(view.slot).toBe(slot);
        expect(view.form).toEqual(restoreForm(slot));
        expect(view.form.displayInstrument).toBe(InstrumentSymbol.ES);
    });

    it('is InputsChanged when only the stop points differ', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const view = expectKind(
            labViewForSlot(slot, { ...searchInputs, stopPoints: 12 }),
            LadderLabViewKind.InputsChanged,
        );
        expect(view.notice).toContain('Inputs changed since this run');
        expect(view.result).toBe(run);
        expect(view.form).toEqual(restoreForm(slot));
    });

    it.each<[string, LadderSearchInputs]>([
        ['the winrate', { ...searchInputs, winrate: 0.45 }],
        [
            'the stop rule',
            { ...searchInputs, stopRule: { kind: DayStopRuleKind.DayGreen } },
        ],
        ['the sims per ladder', { ...searchInputs, sims: 4000 }],
    ])('is InputsChanged when %s differs', (_name, current) => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        expect(labViewForSlot(slot, current).kind).toBe(
            LadderLabViewKind.InputsChanged,
        );
    });

    it('is Cancelled with the navigation notice and the kept progress after a run interrupted by navigation', () => {
        const slot = slotFor(LadderSlotEvent.Unmounted, running);
        const view = expectKind(
            labViewForSlot(slot, searchInputs),
            LadderLabViewKind.Cancelled,
        );
        expect(view.notice).toContain('Search cancelled by navigation');
        expect(view.notice).toContain('40 of 120');
        expect(view.progress).toEqual(progress);
        expect(view.form).toEqual(restoreForm(slot));
    });

    it('is Cancelled without blaming navigation after a user cancel', () => {
        const slot = slotFor(LadderSlotEvent.Cancelled, cancelled);
        const view = expectKind(
            labViewForSlot(slot, searchInputs),
            LadderLabViewKind.Cancelled,
        );
        expect(view.notice).toContain('Search cancelled');
        expect(view.notice).not.toContain('navigation');
    });

    it('stays Cancelled when the inputs changed too, since there is no result to apply', () => {
        const slot = slotFor(LadderSlotEvent.Unmounted, running);
        expect(
            labViewForSlot(slot, { ...searchInputs, stopPoints: 12 }).kind,
        ).toBe(LadderLabViewKind.Cancelled);
    });
});

describe('ladderRowAction', () => {
    const otherPolicy: DayPolicy = {
        ladder: [100, 100],
        maxLossesPerDay: null,
        stopRule: { kind: DayStopRuleKind.None },
    };

    it('applies a restored row under the stored stop rule and rung sizing', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const view = labViewForSlot(slot, searchInputs);
        expect(ladderRowAction(view, score, otherPolicy, scoredSizing)).toEqual(
            {
                kind: LadderRowActionKind.Apply,
                policy: {
                    ladder: [200, 300, 400],
                    maxLossesPerDay: null,
                    stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
                },
                rungSizing: RungSizing.SkipIfUnaffordable,
            },
        );
        expect(ladderRowAction(view, score, null, scoredSizing).kind).toBe(
            LadderRowActionKind.Apply,
        );
    });

    it.each([RungSizing.CapToCushion, RungSizing.SkipIfUnaffordable])(
        'applies the rung sizing the ladder was scored with (%s)',
        (rungSizing) => {
            const inputs = { ...searchInputs, rungSizing };
            const slot = slotFor(LadderSlotEvent.Completed, succeeded, inputs);
            const action = ladderRowAction(
                labViewForSlot(slot, inputs),
                score,
                null,
                RungSizing.CapToCushion,
            );
            expect(action).toMatchObject({
                kind: LadderRowActionKind.Apply,
                rungSizing,
            });
        },
    );

    it('disables Apply when the inputs changed since the run', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const view = labViewForSlot(slot, { ...searchInputs, stopPoints: 12 });
        expect(ladderRowAction(view, score, otherPolicy, scoredSizing)).toEqual(
            {
                kind: LadderRowActionKind.Unavailable,
            },
        );
    });

    it('offers Clear on the active ladder under its scored stop rule, even when the inputs changed', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const active: DayPolicy = {
            ladder: [200, 300, 400],
            maxLossesPerDay: null,
            stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        };
        for (const current of [
            searchInputs,
            { ...searchInputs, stopPoints: 12 },
        ]) {
            expect(
                ladderRowAction(
                    labViewForSlot(slot, current),
                    score,
                    active,
                    scoredSizing,
                ),
            ).toEqual({ kind: LadderRowActionKind.Clear });
        }
    });

    it.each<[string, DayPolicy]>([
        [
            'another stop rule kind',
            {
                ladder: [200, 300, 400],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
        ],
        [
            'another loss count',
            {
                ladder: [200, 300, 400],
                maxLossesPerDay: null,
                stopRule: { k: 3, kind: DayStopRuleKind.AfterKLosses },
            },
        ],
        [
            'a max losses cap the row was not scored with',
            {
                ladder: [200, 300, 400],
                maxLossesPerDay: 3,
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            },
        ],
        [
            'a custom risk function the row was not scored with',
            {
                computeRisk: () => 100,
                ladder: [200, 300, 400],
                maxLossesPerDay: null,
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            },
        ],
    ])(
        'offers Apply under the scored stop rule when the active policy runs the same ladder with %s',
        (_name, active) => {
            const slot = slotFor(LadderSlotEvent.Completed, succeeded);
            expect(
                ladderRowAction(
                    labViewForSlot(slot, searchInputs),
                    score,
                    active,
                    scoredSizing,
                ),
            ).toEqual({
                kind: LadderRowActionKind.Apply,
                policy: {
                    ladder: [200, 300, 400],
                    maxLossesPerDay: null,
                    stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
                },
                rungSizing: RungSizing.SkipIfUnaffordable,
            });
        },
    );

    it('offers Apply again, under the scored rung sizing, when the same ladder runs with another rung sizing', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const active: DayPolicy = {
            ladder: [200, 300, 400],
            maxLossesPerDay: null,
            stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        };
        expect(
            ladderRowAction(
                labViewForSlot(slot, searchInputs),
                score,
                active,
                RungSizing.CapToCushion,
            ),
        ).toEqual({
            kind: LadderRowActionKind.Apply,
            policy: active,
            rungSizing: RungSizing.SkipIfUnaffordable,
        });
    });

    it('keeps Apply off, not Clear, for the same ladder under another rung sizing once the inputs changed', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const active: DayPolicy = {
            ladder: [200, 300, 400],
            maxLossesPerDay: null,
            stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
        };
        expect(
            ladderRowAction(
                labViewForSlot(slot, { ...searchInputs, stopPoints: 12 }),
                score,
                active,
                RungSizing.CapToCushion,
            ),
        ).toEqual({ kind: LadderRowActionKind.Unavailable });
    });

    it('keeps Apply off, not Clear, for the same ladder under another stop rule once the inputs changed', () => {
        const slot = slotFor(LadderSlotEvent.Completed, succeeded);
        const active: DayPolicy = {
            ladder: [200, 300, 400],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        };
        expect(
            ladderRowAction(
                labViewForSlot(slot, { ...searchInputs, stopPoints: 12 }),
                score,
                active,
                scoredSizing,
            ),
        ).toEqual({ kind: LadderRowActionKind.Unavailable });
    });

    it('has nothing to apply on an empty or cancelled view', () => {
        const interrupted = slotFor(LadderSlotEvent.Unmounted, running);
        for (const slot of [null, interrupted]) {
            const view = labViewForSlot(slot, searchInputs);
            expect(
                ladderRowAction(view, score, otherPolicy, scoredSizing),
            ).toEqual({
                kind: LadderRowActionKind.Unavailable,
            });
        }
    });
});

describe('isActiveLadderRow', () => {
    const slot = slotFor(LadderSlotEvent.Completed, succeeded);
    const applied: DayPolicy = {
        ladder: [200, 300, 400],
        maxLossesPerDay: null,
        stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
    };

    it('marks the row active only when the ladder and its scored stop rule are both in effect', () => {
        for (const current of [
            searchInputs,
            { ...searchInputs, stopPoints: 12 },
        ]) {
            const view = labViewForSlot(slot, current);
            expect(isActiveLadderRow(view, score, applied, scoredSizing)).toBe(
                true,
            );
            expect(
                isActiveLadderRow(
                    view,
                    score,
                    {
                        ...applied,
                        stopRule: { kind: DayStopRuleKind.DayGreen },
                    },
                    scoredSizing,
                ),
            ).toBe(false);
            expect(
                isActiveLadderRow(
                    view,
                    score,
                    {
                        ...applied,
                        ladder: [200, 300],
                    },
                    scoredSizing,
                ),
            ).toBe(false);
            expect(isActiveLadderRow(view, score, null, scoredSizing)).toBe(
                false,
            );
        }
    });

    it('marks the row inactive when the calculator runs it under another rung sizing than it was scored with', () => {
        for (const current of [
            searchInputs,
            { ...searchInputs, stopPoints: 12 },
        ]) {
            const view = labViewForSlot(slot, current);
            expect(
                isActiveLadderRow(
                    view,
                    score,
                    applied,
                    RungSizing.CapToCushion,
                ),
            ).toBe(false);
            expect(
                isActiveLadderRow(
                    view,
                    score,
                    applied,
                    RungSizing.SkipIfUnaffordable,
                ),
            ).toBe(true);
        }
    });

    it('compares stop rules by value, not by object identity or key order', () => {
        const view = labViewForSlot(slot, searchInputs);
        const reordered = Object.fromEntries([
            ['kind', DayStopRuleKind.AfterKLosses],
            ['k', 2],
        ]) as DayStopRule;
        expect(reordered).not.toBe(slot.inputs.stopRule);
        expect(
            isActiveLadderRow(
                view,
                score,
                {
                    ladder: [200, 300, 400],
                    maxLossesPerDay: null,
                    stopRule: reordered,
                },
                scoredSizing,
            ),
        ).toBe(true);
    });

    it('compares the target of an after-target stop rule', () => {
        const targetSlot = slotFor(LadderSlotEvent.Completed, succeeded, {
            ...searchInputs,
            stopRule: { dollars: 500, kind: DayStopRuleKind.AfterTarget },
        });
        const view = labViewForSlot(targetSlot, {
            ...searchInputs,
            stopRule: { dollars: 500, kind: DayStopRuleKind.AfterTarget },
        });
        const active: DayPolicy = {
            ladder: [200, 300, 400],
            maxLossesPerDay: null,
            stopRule: { dollars: 500, kind: DayStopRuleKind.AfterTarget },
        };
        expect(isActiveLadderRow(view, score, active, scoredSizing)).toBe(true);
        expect(
            isActiveLadderRow(
                view,
                score,
                {
                    ...active,
                    stopRule: {
                        dollars: 600,
                        kind: DayStopRuleKind.AfterTarget,
                    },
                },
                scoredSizing,
            ),
        ).toBe(false);
    });

    it('marks nothing active on an empty or cancelled view, which has no scored rows', () => {
        const interrupted = slotFor(LadderSlotEvent.Unmounted, running);
        for (const stored of [null, interrupted]) {
            expect(
                isActiveLadderRow(
                    labViewForSlot(stored, searchInputs),
                    score,
                    applied,
                    scoredSizing,
                ),
            ).toBe(false);
        }
    });
});

describe('settledSlotEvent', () => {
    it.each<[LadderRunPhase, LadderSlotEvent | null]>([
        [LadderRunPhase.Succeeded, LadderSlotEvent.Completed],
        [LadderRunPhase.Cancelled, LadderSlotEvent.Cancelled],
        [LadderRunPhase.Running, null],
        [LadderRunPhase.Idle, null],
        [LadderRunPhase.Failed, null],
    ])(
        '%s gives %s, so a progress update never writes the slot',
        (phase, event) => {
            expect(settledSlotEvent(phase)).toBe(event);
        },
    );
});

describe('displayedLadderSlot', () => {
    const stored = slotFor(LadderSlotEvent.Completed, succeeded, {
        ...searchInputs,
        seed: 7,
    });

    it('shows the stored slot while no run happened since mount', () => {
        expect(
            displayedLadderSlot(idle, null, InstrumentSymbol.NQ, stored),
        ).toBe(stored);
        expect(
            displayedLadderSlot(idle, null, InstrumentSymbol.NQ, null),
        ).toBeNull();
    });

    it('hides the stored slot while a new run is in progress or after it failed', () => {
        expect(
            displayedLadderSlot(
                running,
                searchInputs,
                InstrumentSymbol.NQ,
                stored,
            ),
        ).toBeNull();
        expect(
            displayedLadderSlot(
                failed,
                searchInputs,
                InstrumentSymbol.NQ,
                stored,
            ),
        ).toBeNull();
    });

    it('shows a finished live run under the inputs it was started with', () => {
        const slot = displayedLadderSlot(
            succeeded,
            searchInputs,
            InstrumentSymbol.MNQ,
            stored,
        );
        expect(slot).toEqual({
            cancelledByNavigation: false,
            displayInstrument: InstrumentSymbol.MNQ,
            inputs: searchInputs,
            result: succeeded,
        });
    });

    it('shows a user-cancelled live run as cancelled, not by navigation', () => {
        const slot = displayedLadderSlot(
            cancelled,
            searchInputs,
            InstrumentSymbol.NQ,
            stored,
        );
        expect(slot?.result).toEqual(cancelled);
        expect(slot?.cancelledByNavigation).toBe(false);
    });

    it('shows nothing for a settled live run without its inputs', () => {
        expect(
            displayedLadderSlot(succeeded, null, InstrumentSymbol.NQ, stored),
        ).toBeNull();
    });
});
