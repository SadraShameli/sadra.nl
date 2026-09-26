import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator';
import {
    evalRuleContextSchema,
    fundedRuleContextSchema,
    ruleContextAt,
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
            consistencyDailyCap: null,
            contractLimit: null,
            cushion: 2000,
            dayStartDllRoom: 1000,
            instrument: null,
            personalDll: null,
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
            contractLimit: null,
            cushion: 2000,
            dayStartDllRoom: 1000,
            instrument: null,
            personalDll: null,
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
