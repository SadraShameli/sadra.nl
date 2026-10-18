import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    ONE_CENT,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator';
import {
    evalRuleContextSchema,
    fundedRuleContextSchema,
    NO_PERSONAL_CAPS,
    profitCeiling,
    ruleContextAt,
    SizingConstraint,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const apexEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const mffRapidEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});

const NO_CAPS = { instrument: null, personalDll: null } as const;

function stateAt(
    plan: Plan,
    balance: number,
    threshold: number,
    overrides: Partial<AccountState> = {},
): AccountState {
    return { ...plan.initialState(), balance, threshold, ...overrides };
}

describe('ruleContextAt (PT-48a, the one shared RuleContext builder)', () => {
    it('Apex EOD eval at a $2,000 cushion: $1,000 DLL room, $3,000 to target, no consistency cap', () => {
        const context = ruleContextAt(
            apexEod,
            SizingStage.Eval,
            apexEod.initialState(),
            NO_CAPS,
        );

        expect(context).toEqual({
            ceiling: null,
            consistencyDailyCap: null,
            contractLimit: null,
            cushion: 2000,
            dayStartDllRoom: 1000,
            instrument: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            placeableMinimum: ONE_CENT,
            remainingProfitToTarget: 3000,
            stage: SizingStage.Eval,
        });
        expect(evalRuleContextSchema.parse(context)).toEqual(context);
    });

    it('reads the eval contract limit for the given instrument (6 NQ, 60 MNQ on Apex EOD)', () => {
        const state = apexEod.initialState();

        expect(
            ruleContextAt(apexEod, SizingStage.Eval, state, {
                instrument: InstrumentSymbol.NQ,
                personalDll: null,
            }).contractLimit,
        ).toBe(6);
        expect(
            ruleContextAt(apexEod, SizingStage.Eval, state, {
                instrument: InstrumentSymbol.MNQ,
                personalDll: null,
            }).contractLimit,
        ).toBe(60);
    });

    it('MFF Rapid EOD eval with $1,000 profit: 30% consistency cap of the target, $2,000 left to target, no DLL', () => {
        const state = stateAt(mffRapidEod, 51_000, 49_000, {
            peakDayCloseProfit: 1000,
            peakIntradayProfit: 1000,
        });
        const context = ruleContextAt(
            mffRapidEod,
            SizingStage.Eval,
            state,
            NO_CAPS,
        );

        expect(context.cushion).toBe(2000);
        expect(context.dayStartDllRoom).toBeNull();
        expect(context.remainingProfitToTarget).toBe(2000);
        expect(context.consistencyDailyCap).toBeCloseTo(0.3 * 3000, 9);
        expect(evalRuleContextSchema.parse(context)).toEqual(context);
    });

    it('funded at start: $2,000 cushion, the Level 1 $1,000 DLL, no eval fields', () => {
        const state = apexEod.initialState();
        apexEod.beginFundedPhase(state);
        const context = ruleContextAt(
            apexEod,
            SizingStage.Funded,
            state,
            NO_CAPS,
        );

        expect(context).toEqual({
            ceiling: null,
            contractLimit: null,
            cushion: 2000,
            dayStartDllRoom: 1000,
            instrument: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            placeableMinimum: ONE_CENT,
            stage: SizingStage.Funded,
        });
        expect(fundedRuleContextSchema.parse(context)).toEqual(context);
    });

    it('a tiered DLL plan resolves the day-start Level: Apex funded at $3,000 session-open profit has a $2,000 DLL and 4 NQ', () => {
        const state = apexEod.initialState();
        apexEod.beginFundedPhase(state);
        state.balance = 53_000;
        state.threshold = 50_100;
        state.thresholdLocked = true;
        state.peakDayCloseProfit = 3000;
        state.peakIntradayProfit = 3000;
        const context = ruleContextAt(apexEod, SizingStage.Funded, state, {
            instrument: InstrumentSymbol.NQ,
            personalDll: null,
        });

        expect(context.cushion).toBe(2900);
        expect(context.dayStartDllRoom).toBe(2000);
        expect(context.contractLimit).toBe(4);
        expect(fundedRuleContextSchema.parse(context)).toEqual(context);
    });

    it('passes a personal DLL through (the advisor sets it; simulations pass null per Q18)', () => {
        const context = ruleContextAt(
            apexEod,
            SizingStage.Eval,
            apexEod.initialState(),
            { instrument: null, personalDll: dollars(600) },
        );

        expect(context.personalDll).toBe(600);
    });

    it('defaults the new PT-19 step-2 fields to null, no caps and one cent (nothing moves when none is set)', () => {
        const context = ruleContextAt(
            apexEod,
            SizingStage.Funded,
            (() => {
                const state = apexEod.initialState();
                apexEod.beginFundedPhase(state);
                return state;
            })(),
            NO_CAPS,
        );

        expect(context.ceiling).toBeNull();
        expect(context.personalCaps).toEqual(NO_PERSONAL_CAPS);
        expect(context.placeableMinimum).toBe(ONE_CENT);
    });

    it('threads a funded ceiling, personal caps and a placeable minimum through', () => {
        const state = apexEod.initialState();
        apexEod.beginFundedPhase(state);
        const personalCaps = {
            dailyProfitCap: dollars(400),
            maxRiskPerTrade: dollars(150),
            maxTradesPerDay: 2,
        };
        const context = ruleContextAt(apexEod, SizingStage.Funded, state, {
            ceiling: dollars(900),
            instrument: null,
            personalCaps,
            personalDll: null,
            placeableMinimum: dollars(5),
        });

        expect(context.ceiling).toBe(900);
        expect(context.personalCaps).toEqual(personalCaps);
        expect(context.placeableMinimum).toBe(5);
        expect(fundedRuleContextSchema.parse(context)).toEqual(context);
    });

    it('goes negative on remaining profit once the eval profit is past the target', () => {
        const state = stateAt(apexEod, 53_500, 51_500);
        const context = ruleContextAt(
            apexEod,
            SizingStage.Eval,
            state,
            NO_CAPS,
        );

        expect(context.remainingProfitToTarget).toBe(-500);
        expect(evalRuleContextSchema.parse(context)).toEqual(context);
    });
});

describe('profitCeiling on Funded and Live (F-154, PT-19 step 2)', () => {
    it('returns null for Funded and Live when no ceiling is set (nothing moves)', () => {
        const funded = ruleContextAt(
            apexEod,
            SizingStage.Funded,
            (() => {
                const state = apexEod.initialState();
                apexEod.beginFundedPhase(state);
                return state;
            })(),
            NO_CAPS,
        );

        expect(profitCeiling(funded)).toBeNull();
    });

    it('reports the funded ceiling as a CeilingCap-tagged CappedAmount', () => {
        const state = apexEod.initialState();
        apexEod.beginFundedPhase(state);
        const funded = ruleContextAt(apexEod, SizingStage.Funded, state, {
            ceiling: dollars(700),
            instrument: null,
            personalDll: null,
        });

        expect(profitCeiling(funded)).toEqual({
            amount: 700,
            constraint: SizingConstraint.CeilingCap,
        });
    });

    it('reports the live ceiling as a CeilingCap-tagged CappedAmount', () => {
        const live = {
            ceiling: dollars(300),
            contractLimit: null,
            cushion: dollars(4000),
            dayStartDllRoom: null,
            floorTradeRisk: dollars(0),
            instrument: null,
            liveCushionPercent: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            placeableMinimum: ONE_CENT,
            stage: SizingStage.Live as const,
            thresholdLocked: false,
        };

        expect(profitCeiling(live)).toEqual({
            amount: 300,
            constraint: SizingConstraint.CeilingCap,
        });
        expect(profitCeiling({ ...live, ceiling: null })).toBeNull();
    });
});
