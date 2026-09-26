import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    computeEvalStateValue,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    InstrumentSymbol,
    type Plan,
    PolicySizing,
    type SimInputs,
    simulate,
    TradingPhase,
} from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { findFirm } from '~/lib/prop-calculator/firms';
import { resolveDayPolicy } from '~/lib/prop-calculator/simulator';
import { dayPolicySchema } from '~/lib/schemas/url';

function apexEodPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function declaredLadder(sizing: PolicySizing): DayPolicy {
    return {
        ladder: [250, 250],
        maxLossesPerDay: null,
        sizing,
        stopRule: { kind: DayStopRuleKind.None },
    };
}

function mnqInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 20,
        instrument: InstrumentSymbol.MNQ,
        maxEvalDays: 20,
        plan: apexEodPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        stopPoints: 10,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.45,
        ...overrides,
    };
}

describe('a declared policy keeps its own sizing, and simulate refuses one that contradicts its phase under position sizing (T33, U18, N-71)', () => {
    it('returns a declared funded WholeContracts policy as declared, the same object the portfolio timeline runs', () => {
        const declared = declaredLadder(PolicySizing.WholeContracts);
        expect(
            resolveDayPolicy(
                mnqInputs({ fundedDayPolicy: declared }),
                TradingPhase.Funded,
            ),
        ).toBe(declared);
    });

    it('returns a declared eval ContractCapped policy as declared, the same object the portfolio timeline runs', () => {
        const declared = declaredLadder(PolicySizing.ContractCapped);
        expect(
            resolveDayPolicy(
                mnqInputs({ evalDayPolicy: declared }),
                TradingPhase.Eval,
            ),
        ).toBe(declared);
    });

    it('refuses a declared funded ContractCapped policy when position sizing is given, instead of silently placing it in whole contracts', () => {
        expect(() =>
            simulate(
                mnqInputs({
                    fundedDayPolicy: declaredLadder(
                        PolicySizing.ContractCapped,
                    ),
                }),
            ),
        ).toThrow(
            /fundedDayPolicy\.sizing is contractCapped, but a funded policy with position sizing .* is placed as wholeContracts/,
        );
    });

    it('refuses a declared eval WholeContracts policy when position sizing is given, since eval stays contract-capped', () => {
        expect(() =>
            simulate(
                mnqInputs({
                    evalDayPolicy: declaredLadder(PolicySizing.WholeContracts),
                }),
            ),
        ).toThrow(
            /evalDayPolicy\.sizing is wholeContracts, but an eval policy with position sizing .* is placed as contractCapped/,
        );
    });

    it('returns a declared funded ContractCapped policy as declared when there is no position sizing, where sizing places nothing', () => {
        const declared = declaredLadder(PolicySizing.ContractCapped);
        expect(
            resolveDayPolicy(
                mnqInputs({
                    fundedDayPolicy: declared,
                    instrument: undefined,
                    stopPoints: undefined,
                }),
                TradingPhase.Funded,
            ),
        ).toBe(declared);
    });
});

describe('every policy builder states its sizing (T33, N-71)', () => {
    const plan = apexEodPlan();

    it('builds the funded dynamic program policy, the one the DP cross-check simulates, as WholeContracts', () => {
        const result = computeFundedStateValue({
            actionStepMultiple: 0.25,
            commission: dollars(0),
            cushionStepMultiple: 0.25,
            cycleBestDayBucketCount: 1,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 0.5,
            maxCushionMultiple: 1.5,
            maxPreLockOffsetMultiple: 1,
            payoutRegimeCap: 0,
            plan,
            rrRatio: 3,
            tradesPerDay: 1,
            winrate: 0.95,
        });
        expect(result.dayPolicy.sizing).toBe(PolicySizing.WholeContracts);
    });

    it('builds the eval dynamic program policy as ContractCapped', () => {
        const result = computeEvalStateValue({
            commission: dollars(0),
            maxActionDollars: 800,
            maxEvalDays: 2,
            plan,
            rrRatio: 3.2,
            tradesPerDay: 1,
            winrate: fraction(0.95),
        });
        expect(result.dayPolicy.sizing).toBe(PolicySizing.ContractCapped);
    });

    it('parses a shared eval ladder link from before the sizing field as ContractCapped', () => {
        const parsed = dayPolicySchema.parse({
            ladder: [400, 600],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        });
        expect(parsed.sizing).toBe(PolicySizing.ContractCapped);
    });

    it.each(['fractional', PolicySizing.WholeContracts])(
        'parses a link whose eval ladder states sizing %s as ContractCapped, so a link cannot choose eval sizing (U18)',
        (sizing) => {
            const base = {
                ladder: [400, 600],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            };
            expect(dayPolicySchema.parse({ ...base, sizing })).toEqual({
                ...base,
                sizing: PolicySizing.ContractCapped,
            });
        },
    );
});
