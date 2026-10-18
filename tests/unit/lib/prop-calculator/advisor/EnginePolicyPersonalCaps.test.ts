import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    type Plan,
    policySizingOf,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type EnginePolicy,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
} from '~/lib/prop-calculator/advisor';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    resolveDayPolicy,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';

function apexEod(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex Eod 50K plan not found');
    return plan;
}

function baseInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 40,
        maxEvalDays: 30,
        payoutRequestSize: 500,
        plan: apexEod(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 10,
        winrate: 0.4,
        ...overrides,
    };
}

function fundedState() {
    const plan = apexEod();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function policyWith(caps: Partial<PersonalCaps>): EnginePolicy {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 40,
        personalCaps: { ...NO_PERSONAL_CAPS, ...caps },
        plan: apexEod(),
        rulebook: DEFAULT_RULEBOOK,
    });
    return policy;
}

describe('buildEnginePolicy carries the personal limits (PT-68f, F-V16)', () => {
    it('puts the personal caps and the personal daily loss limit on the policy', () => {
        const caps: PersonalCaps = {
            dailyProfitCap: dollars(700),
            maxRiskPerTrade: dollars(150),
            maxTradesPerDay: 3,
        };
        const { policy } = buildEnginePolicy({
            fundedHorizonDays: 40,
            personalCaps: caps,
            personalDll: dollars(600),
            plan: apexEod(),
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(policy.personalCaps).toEqual(caps);
        expect(policy.personalDll).toBe(600);
    });

    it('leaves both keys off the policy when no limit is set, so the cache key of a plain account is unchanged', () => {
        const none = buildEnginePolicy({
            fundedHorizonDays: 40,
            plan: apexEod(),
            rulebook: DEFAULT_RULEBOOK,
        }).policy;
        const explicitNone = buildEnginePolicy({
            fundedHorizonDays: 40,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            plan: apexEod(),
            rulebook: DEFAULT_RULEBOOK,
        }).policy;

        expect('personalCaps' in none).toBe(false);
        expect('personalDll' in none).toBe(false);
        expect(explicitNone).toStrictEqual(none);
    });
});

describe('applyEnginePolicy applies the personal max risk and max trades to the sweep inputs (PT-68f, F-V16)', () => {
    it('passes the base through untouched when the policy has no personal limit', () => {
        const base = baseInputs({ fundedRiskPerTrade: 400 });
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith(NO_PERSONAL_CAPS),
            base,
        );

        expect(applied.fundedRiskPerTrade).toBe(400);
        expect(applied.riskPerTrade).toBe(250);
        expect(applied.tradesPerDay).toBe(4);
        expect(applied.fundedDayPolicy).toBeUndefined();
    });

    it('caps a flat funded candidate and the base risk at the personal max risk', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(100) }),
            baseInputs({ fundedRiskPerTrade: 400 }),
        );

        expect(applied.fundedRiskPerTrade).toBe(100);
        expect(applied.riskPerTrade).toBe(100);
    });

    it('keeps a flat candidate that is already below the cap', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(300) }),
            baseInputs({ fundedRiskPerTrade: 150 }),
        );

        expect(applied.fundedRiskPerTrade).toBe(150);
    });

    it('bounds a percent-of-cushion candidate at the personal max risk on every day', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(100) }),
            baseInputs({ fundedCushionPercent: fraction(0.1) }),
        );
        const state = fundedState();
        const computeRisk = applied.fundedDayPolicy?.computeRisk;

        expect(applied.fundedCushionPercent).toBeUndefined();
        expect(computeRisk?.(state, 0)).toBe(100);
        state.balance += 5000;
        expect(computeRisk?.(state, 0)).toBe(100);
    });

    it('gives the percent-of-cushion policy the capped trades per day and drops fundedTradesPerDay, which the simulator rejects beside a day policy', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(100), maxTradesPerDay: 2 }),
            baseInputs({
                fundedCushionPercent: fraction(0.1),
                fundedTradesPerDay: 3,
            }),
        );

        expect(applied.fundedTradesPerDay).toBeUndefined();
        const policy = resolveDayPolicy(applied, TradingPhase.Funded);
        expect(policy.ladder).toHaveLength(2);
    });

    it('keeps the base funded trades per day on the percent-of-cushion policy when no max trades is set', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(100) }),
            baseInputs({
                fundedCushionPercent: fraction(0.1),
                fundedTradesPerDay: 3,
            }),
        );

        expect(applied.fundedTradesPerDay).toBeUndefined();
        expect(
            resolveDayPolicy(applied, TradingPhase.Funded).ladder,
        ).toHaveLength(3);
    });

    it('leaves a percent-of-cushion candidate below the cap on its percent', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(100) }),
            baseInputs({ fundedCushionPercent: fraction(0.01) }),
        );
        const state = fundedState();

        expect(applied.fundedDayPolicy?.computeRisk?.(state, 0)).toBe(
            0.01 * (state.balance - state.threshold),
        );
    });

    it('caps each rung of a declared funded ladder at the personal max risk', () => {
        const ladder = flatDayPolicy(
            400,
            4,
            { kind: DayStopRuleKind.None },
            policySizingOf(TradingPhase.Funded),
        );
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxRiskPerTrade: dollars(100) }),
            baseInputs({
                fundedDayPolicy: {
                    ...ladder,
                    ladder: [150, 300, 50, 400],
                },
                riskPerTrade: 400,
            }),
        );

        expect(applied.fundedDayPolicy?.ladder).toEqual([100, 100, 50, 100]);
    });

    it('bounds the trades per day at the personal maximum', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxTradesPerDay: 2 }),
            baseInputs({ fundedTradesPerDay: 3 }),
        );

        expect(applied.tradesPerDay).toBe(2);
        expect(applied.fundedTradesPerDay).toBe(2);
    });

    it('keeps the trades per day when the personal maximum is above it', () => {
        const applied = applyEnginePolicy(
            apexEod(),
            policyWith({ maxTradesPerDay: 9 }),
            baseInputs(),
        );

        expect(applied.tradesPerDay).toBe(4);
        expect(applied.fundedTradesPerDay).toBeUndefined();
    });
});
