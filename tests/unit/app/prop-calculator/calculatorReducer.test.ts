import { describe, expect, it } from 'vitest';

import type { CalculatorState } from '~/app/(app)/prop-calculator/_components/types';

import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    RungSizing,
} from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function apex() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Apex);
    if (!firm) throw new Error('Apex firm not registered');
    return firm;
}

function apexEodPlan() {
    const firm = apex();
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function mffu() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Mffu);
    if (!firm) throw new Error('MFFU firm not registered');
    return firm;
}

function mffuPlan(variant: MffuVariant) {
    const firm = mffu();
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFFU ${variant} plan not found`);
    return plan;
}

function reduce(
    state: CalculatorState,
    action: CalculatorAction,
): CalculatorState {
    return calculatorReducer(state, action);
}

describe('calculatorReducer scalar setters', () => {
    it('clamps winrate to the shared schema bounds', () => {
        const state = defaultCalculatorState();
        const clampedHigh = reduce(state, {
            type: CalculatorActionType.SetWinrate,
            value: 5,
        });
        expect(clampedHigh.winrate).toBe(0.95);

        const clampedLow = reduce(state, {
            type: CalculatorActionType.SetWinrate,
            value: -1,
        });
        expect(clampedLow.winrate).toBe(0.05);
    });

    it('falls back to the current value on non-finite input, not a hardcoded default', () => {
        const state = { ...defaultCalculatorState(), trials: 3000 };
        const next = reduce(state, {
            type: CalculatorActionType.SetTrials,
            value: NaN,
        });
        expect(next.trials).toBe(3000);
    });
});

describe('calculatorReducer plan-dependent copyAccounts clamping', () => {
    it('SET_COPY_ACCOUNTS clamps to the current plan/firm cap', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            firm: mffu(),
            plan: mffuPlan(MffuVariant.Builder),
        };
        const next = reduce(state, {
            type: CalculatorActionType.SetCopyAccounts,
            value: 999,
        });
        expect(next.copyAccounts).toBe(mffu().maxFundedAccounts(state.plan));
        expect(next.copyAccounts).toBe(1);
    });

    it('SET_PLAN clamps copyAccounts down when the new plan has a lower cap', () => {
        const proPlan = mffuPlan(MffuVariant.Pro);
        const builderPlan = mffuPlan(MffuVariant.Builder);
        expect(mffu().maxFundedAccounts(proPlan)).toBeGreaterThan(
            mffu().maxFundedAccounts(builderPlan),
        );

        const state: CalculatorState = {
            ...defaultCalculatorState(),
            copyAccounts: mffu().maxFundedAccounts(proPlan),
            firm: mffu(),
            plan: proPlan,
        };
        const next = reduce(state, {
            plan: builderPlan,
            type: CalculatorActionType.SetPlan,
        });
        expect(next.copyAccounts).toBe(mffu().maxFundedAccounts(builderPlan));
        expect(next.firmMemory[FirmId.Mffu]).toStrictEqual({
            copyAccounts: mffu().maxFundedAccounts(builderPlan),
            planId: builderPlan.id,
        });
    });

    it('SET_FIRM restores a remembered plan/copyAccounts, clamped to that plan cap', () => {
        const proPlan = mffuPlan(MffuVariant.Pro);
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            firm: apex(),
            firmMemory: {
                [FirmId.Mffu]: {
                    copyAccounts: 999,
                    planId: proPlan.id,
                },
            },
            plan: apexEodPlan(),
        };
        const next = reduce(state, {
            firm: mffu(),
            type: CalculatorActionType.SetFirm,
        });
        expect(next.plan.id).toStrictEqual(proPlan.id);
        expect(next.copyAccounts).toBe(mffu().maxFundedAccounts(proPlan));
    });

    it('SET_FIRM defaults to the first plan and copyAccounts 1 when nothing is remembered', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            firm: apex(),
            plan: apexEodPlan(),
        };
        const next = reduce(state, {
            firm: mffu(),
            type: CalculatorActionType.SetFirm,
        });
        expect(next.plan.id).toStrictEqual(mffu().plans[0]?.id);
        expect(next.copyAccounts).toBe(1);
    });
});

describe('calculatorReducer APPLY_STATE closes the unclamped-overwrite gap', () => {
    it('clamps riskDollars and copyAccounts on a raw whole-state overwrite', () => {
        const builderPlan = mffuPlan(MffuVariant.Builder);
        const incoming: CalculatorState = {
            ...defaultCalculatorState(),
            copyAccounts: 999,
            firm: mffu(),
            plan: builderPlan,
            riskDollars: 999_999_999,
        };
        const next = reduce(defaultCalculatorState(), {
            state: incoming,
            type: CalculatorActionType.ApplyState,
        });
        expect(next.copyAccounts).toBe(mffu().maxFundedAccounts(builderPlan));
        expect(next.riskDollars).toBeLessThanOrEqual(builderPlan.accountSize);
    });

    it('leaves in-range values untouched', () => {
        const incoming: CalculatorState = {
            ...defaultCalculatorState(),
            copyAccounts: 1,
            riskDollars: 500,
        };
        const next = reduce(defaultCalculatorState(), {
            state: incoming,
            type: CalculatorActionType.ApplyState,
        });
        expect(next.riskDollars).toBe(500);
        expect(next.copyAccounts).toBe(1);
    });
});

describe('calculatorReducer lab scenario actions', () => {
    it('ADD_LAB_SCENARIO copies the last scenario with a fresh id and label suffix', () => {
        const state = defaultCalculatorState();
        const next = reduce(state, {
            type: CalculatorActionType.AddLabScenario,
        });
        const last = next.labScenarios.at(-1);
        const previousLast = state.labScenarios.at(-1);
        expect(next.labScenarios).toHaveLength(state.labScenarios.length + 1);
        expect(last?.label).toBe(`${previousLast?.label} copy`);
        expect(last?.id).not.toBe(previousLast?.id);
    });

    it('REMOVE_LAB_SCENARIO removes only the targeted scenario', () => {
        const state = defaultCalculatorState();
        const targetId = state.labScenarios[0]?.id;
        if (!targetId) throw new Error('expected a seeded lab scenario');
        const next = reduce(state, {
            id: targetId,
            type: CalculatorActionType.RemoveLabScenario,
        });
        expect(next.labScenarios.some((sc) => sc.id === targetId)).toBe(false);
        expect(next.labScenarios).toHaveLength(state.labScenarios.length - 1);
    });

    it('UPDATE_LAB_SCENARIO merges the patch into the matching scenario only', () => {
        const state = defaultCalculatorState();
        const target = state.labScenarios[0];
        if (!target) throw new Error('expected a seeded lab scenario');
        const next = reduce(state, {
            id: target.id,
            patch: { winrate: 0.6 },
            type: CalculatorActionType.UpdateLabScenario,
        });
        const updated = next.labScenarios.find((sc) => sc.id === target.id);
        expect(updated?.winrate).toBe(0.6);
        expect(updated?.rrRatio).toBe(target.rrRatio);
    });
});

describe('calculatorReducer reset actions', () => {
    it('RESET_COUPON clears all four discount fields without touching the rest of state', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            activationDiscountPercent: 50,
            evalDiscountPercent: 25,
            linkActivationDiscount: true,
            monthlySubscriptionDiscountPercent: 40,
            resetDiscountPercent: 10,
            trials: 3000,
        };
        const next = reduce(state, {
            type: CalculatorActionType.ResetCoupon,
        });
        expect(next.activationDiscountPercent).toBe(0);
        expect(next.evalDiscountPercent).toBe(0);
        expect(next.linkActivationDiscount).toBe(false);
        expect(next.monthlySubscriptionDiscountPercent).toBe(0);
        expect(next.resetDiscountPercent).toBe(0);
        expect(next.trials).toBe(3000);
    });

    it('RESET restores default scalar and mode fields', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            sizingMode: SizingMode.Percent,
            trials: 4000,
            winrate: 0.9,
        };
        const next = reduce(state, { type: CalculatorActionType.Reset });
        const fresh = defaultCalculatorState();
        expect(next.sizingMode).toBe(fresh.sizingMode);
        expect(next.trials).toBe(fresh.trials);
        expect(next.winrate).toBe(fresh.winrate);
        expect(next.firm.id).toBe(fresh.firm.id);
        expect(next.plan.id).toStrictEqual(fresh.plan.id);
    });

    it('RESET_LAB_SCENARIOS restores the default 3-scenario set', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            labScenarios: [],
        };
        const next = reduce(state, {
            type: CalculatorActionType.ResetLabScenarios,
        });
        expect(next.labScenarios).toHaveLength(3);
    });
});

describe('calculatorReducer day stop rule', () => {
    it('SET_DAY_STOP replaces the rule verbatim', () => {
        const state = defaultCalculatorState();
        const next = reduce(state, {
            rule: { k: 3, kind: DayStopRuleKind.AfterKLosses },
            type: CalculatorActionType.SetDayStop,
        });
        expect(next.dayStop).toStrictEqual({
            k: 3,
            kind: DayStopRuleKind.AfterKLosses,
        });
    });
});

describe('calculatorReducer position sizing (contract-limit enforcement)', () => {
    it('SET_INSTRUMENT sets and clears the instrument independently of stopPoints', () => {
        const state = defaultCalculatorState();
        expect(state.instrument).toBeNull();

        const withInstrument = reduce(state, {
            instrument: InstrumentSymbol.NQ,
            type: CalculatorActionType.SetInstrument,
        });
        expect(withInstrument.instrument).toBe(InstrumentSymbol.NQ);

        const cleared = reduce(withInstrument, {
            instrument: null,
            type: CalculatorActionType.SetInstrument,
        });
        expect(cleared.instrument).toBeNull();
    });

    it('SET_STOP_POINTS clamps to the shared schema bounds and falls back to the current value on invalid input', () => {
        const state = {
            ...defaultCalculatorState(),
            stopPoints: 15,
        };
        const tooLow = reduce(state, {
            type: CalculatorActionType.SetStopPoints,
            value: 0,
        });
        expect(tooLow.stopPoints).toBe(0.25);

        const invalid = reduce(state, {
            type: CalculatorActionType.SetStopPoints,
            value: NaN,
        });
        expect(invalid.stopPoints).toBe(15);
    });
});

describe('calculatorReducer retained cushion (E14 revisit)', () => {
    it('SET_RETAINED_CUSHION sets and clears independently, defaulting to null (plan default)', () => {
        const state = defaultCalculatorState();
        expect(state.retainedCushion).toBeNull();

        const withValue = reduce(state, {
            type: CalculatorActionType.SetRetainedCushion,
            value: 2500,
        });
        expect(withValue.retainedCushion).toBe(2500);

        const cleared = reduce(withValue, {
            type: CalculatorActionType.SetRetainedCushion,
            value: null,
        });
        expect(cleared.retainedCushion).toBeNull();
    });

    it('SET_RETAINED_CUSHION clamps to the shared schema bounds and falls back to the current value on invalid input', () => {
        const state = {
            ...defaultCalculatorState(),
            retainedCushion: 5000,
        };
        const tooHigh = reduce(state, {
            type: CalculatorActionType.SetRetainedCushion,
            value: 999_999_999,
        });
        expect(tooHigh.retainedCushion).toBe(100_000);

        const invalid = reduce(state, {
            type: CalculatorActionType.SetRetainedCushion,
            value: NaN,
        });
        expect(invalid.retainedCushion).toBe(5000);
    });
});

describe('calculatorReducer monthly subscription / reset discount (H2)', () => {
    it('SET_MONTHLY_SUBSCRIPTION_DISCOUNT_PERCENT clamps to the shared schema bounds and falls back to the current value on invalid input', () => {
        const state = {
            ...defaultCalculatorState(),
            monthlySubscriptionDiscountPercent: 40,
        };
        const tooHigh = reduce(state, {
            type: CalculatorActionType.SetMonthlySubscriptionDiscountPercent,
            value: 500,
        });
        expect(tooHigh.monthlySubscriptionDiscountPercent).toBe(100);

        const invalid = reduce(state, {
            type: CalculatorActionType.SetMonthlySubscriptionDiscountPercent,
            value: NaN,
        });
        expect(invalid.monthlySubscriptionDiscountPercent).toBe(40);
    });

    it('SET_RESET_DISCOUNT_PERCENT clamps to the shared schema bounds and falls back to the current value on invalid input', () => {
        const state = {
            ...defaultCalculatorState(),
            resetDiscountPercent: 25,
        };
        const tooLow = reduce(state, {
            type: CalculatorActionType.SetResetDiscountPercent,
            value: -10,
        });
        expect(tooLow.resetDiscountPercent).toBe(0);

        const invalid = reduce(state, {
            type: CalculatorActionType.SetResetDiscountPercent,
            value: NaN,
        });
        expect(invalid.resetDiscountPercent).toBe(25);
    });
});

describe('calculatorReducer payoutRequestSize (H3)', () => {
    it('SET_PAYOUT_REQUEST_SIZE sets and clears independently, defaulting to null ("withdraw everything")', () => {
        const state = defaultCalculatorState();
        expect(state.payoutRequestSize).toBeNull();

        const withValue = reduce(state, {
            type: CalculatorActionType.SetPayoutRequestSize,
            value: 5000,
        });
        expect(withValue.payoutRequestSize).toBe(5000);

        const cleared = reduce(withValue, {
            type: CalculatorActionType.SetPayoutRequestSize,
            value: null,
        });
        expect(cleared.payoutRequestSize).toBeNull();
    });

    it('SET_PAYOUT_REQUEST_SIZE clamps to the shared schema bounds and falls back to the current value on invalid input', () => {
        const state = {
            ...defaultCalculatorState(),
            payoutRequestSize: 5000,
        };
        const tooHigh = reduce(state, {
            type: CalculatorActionType.SetPayoutRequestSize,
            value: 999_999_999,
        });
        expect(tooHigh.payoutRequestSize).toBe(1_000_000);

        const invalid = reduce(state, {
            type: CalculatorActionType.SetPayoutRequestSize,
            value: NaN,
        });
        expect(invalid.payoutRequestSize).toBe(5000);
    });
});

describe('calculatorReducer rungSizing (H4)', () => {
    it('SET_RUNG_SIZING replaces the mode verbatim, defaulting to CapToCushion', () => {
        const state = defaultCalculatorState();
        expect(state.rungSizing).toBe(RungSizing.CapToCushion);

        const next = reduce(state, {
            type: CalculatorActionType.SetRungSizing,
            value: RungSizing.SkipIfUnaffordable,
        });
        expect(next.rungSizing).toBe(RungSizing.SkipIfUnaffordable);
    });
});
