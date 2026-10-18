import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { kpiDescriptions } from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    AlphaFuturesVariant,
    FirmId,
    percent,
    type Plan,
    withFundedResetTaken,
} from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function alpha() {
    const firm = ALL_FIRMS.find(
        (candidate) => candidate.id === FirmId.AlphaFutures,
    );
    if (!firm) throw new Error('Alpha Futures firm not registered');
    return firm;
}

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = alpha().findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

function takenOnZero() {
    return calculatorReducer(zeroState(), {
        isTaken: true,
        type: CalculatorActionType.SetTakesFundedReset,
    });
}

function zeroState() {
    return {
        ...defaultCalculatorState(),
        firm: alpha(),
        plan: alphaPlan(AlphaFuturesVariant.Zero),
    };
}

describe('web calculator input for the Alpha Qualified Reset (N-34, T31 opt-in)', () => {
    it('starts off and toggles through the reducer', () => {
        expect(zeroState().takesFundedReset).toBe(false);

        const next = takenOnZero();
        expect(next.takesFundedReset).toBe(true);
        expect(next.plan).toBe(zeroState().plan);
        expect(next.takesOneTimeEarlyWithdrawal).toBe(false);
    });

    it('round-trips through the share URL and defaults to off when absent', () => {
        const encoded = encodeState({ ...zeroState(), takesFundedReset: true });

        expect(encoded.get('qr')).toBe('1');
        expect(
            decodeState(encoded, ALL_FIRMS, defaultCalculatorState())
                .takesFundedReset,
        ).toBe(true);

        encoded.delete('qr');
        expect(
            decodeState(encoded, ALL_FIRMS, defaultCalculatorState())
                .takesFundedReset,
        ).toBe(false);
    });

    it('turns off when switching to Advanced, which offers no reset, and stays off on the way back', () => {
        const onAdvanced = calculatorReducer(takenOnZero(), {
            plan: alphaPlan(AlphaFuturesVariant.Advanced),
            type: CalculatorActionType.SetPlan,
        });
        expect(onAdvanced.takesFundedReset).toBe(false);

        expect(
            calculatorReducer(onAdvanced, {
                plan: alphaPlan(AlphaFuturesVariant.Zero),
                type: CalculatorActionType.SetPlan,
            }).takesFundedReset,
        ).toBe(false);
    });

    it('stays on when switching to Standard, which also offers the reset', () => {
        expect(
            calculatorReducer(takenOnZero(), {
                plan: alphaPlan(AlphaFuturesVariant.Standard),
                type: CalculatorActionType.SetPlan,
            }).takesFundedReset,
        ).toBe(true);
    });

    it('cannot be turned on for a plan without the reset', () => {
        expect(
            calculatorReducer(
                {
                    ...zeroState(),
                    plan: alphaPlan(AlphaFuturesVariant.Advanced),
                },
                {
                    isTaken: true,
                    type: CalculatorActionType.SetTakesFundedReset,
                },
            ).takesFundedReset,
        ).toBe(false);
    });

    it('keys cached simulations on the opt-in, so toggling it never reuses a stale result', () => {
        const zero = alphaPlan(AlphaFuturesVariant.Zero);
        const base = {
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 0.5,
        };

        expect(simInputsCacheKey({ ...base, plan: zero })).not.toBe(
            simInputsCacheKey({
                ...base,
                plan: withFundedResetTaken(zero, true),
            }),
        );
    });

    it('keys cached simulations on every coupon percent, so a new reset, monthly or bundle discount never reuses a stale result', () => {
        const base = {
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            plan: withFundedResetTaken(
                alphaPlan(AlphaFuturesVariant.Zero),
                true,
            ),
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 0.5,
        };
        const noCoupon = {
            activationPercent: percent(0),
            evalPercent: percent(0),
        };
        const baseline = simInputsCacheKey({ ...base, discounts: noCoupon });

        for (const changed of [
            { resetPercent: percent(50) },
            { monthlySubscriptionPercent: percent(50) },
            { bundlePercent: percent(50) },
        ]) {
            expect(
                simInputsCacheKey({
                    ...base,
                    discounts: { ...noCoupon, ...changed },
                }),
            ).not.toBe(baseline);
        }
        expect(simInputsCacheKey(base)).toBe(baseline);
    });

    it('says in the funded survival description that a breach repaired by an opted-in funded reset is not a bust', () => {
        expect(kpiDescriptions.fundedSurvival).toContain(
            'A breach repaired by an opted-in funded reset does not count as a bust.',
        );
    });
});
