import { describe, expect, it } from 'vitest';

import {
    type DayPolicy,
    DayStopRuleKind,
    FirmId,
    fraction,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    assertNoFundedDayPolicyConflict,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';
import { resolveDayPolicy } from '~/lib/prop-calculator/simulator/day';

function baseInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 60,
        maxEvalDays: 60,
        plan: rapidEodPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 10,
        winrate: 0.4,
        ...overrides,
    };
}

function rapidEodPlan() {
    const firm = findFirm(FirmId.Mffu);
    if (!firm) throw new Error('MFFU firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

const someLadder: DayPolicy = {
    ladder: [400, 600, 800, 200],
    maxLossesPerDay: null,
    stopRule: { kind: DayStopRuleKind.None },
};

describe(
    'resolveDayPolicy: funded day-policy conflict is a thrown error, not a ' +
        'silent no-op (deliberate scope: eval-side evalDayPolicy vs riskPerTrade/' +
        'tradesPerDay is NOT covered here, because riskPerTrade stays genuinely ' +
        'meaningful even when a ladder is set -- it feeds expectancyR and the ' +
        'funded-phase fallback default -- so hard-erroring it would break the ' +
        "CLI's own --ladder feature, whose --risk flag always carries a default",
    () => {
        it('throws when fundedDayPolicy and fundedCushionPercent are both set', () => {
            const inputs = baseInputs({
                fundedCushionPercent: fraction(0.1),
                fundedDayPolicy: someLadder,
            });
            expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
                /fundedCushionPercent/,
            );
        });

        it('throws when fundedDayPolicy and fundedRiskPerTrade are both set', () => {
            const inputs = baseInputs({
                fundedDayPolicy: someLadder,
                fundedRiskPerTrade: 300,
            });
            expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
                /fundedRiskPerTrade/,
            );
        });

        it('throws when fundedDayPolicy and fundedTradesPerDay are both set', () => {
            const inputs = baseInputs({
                fundedDayPolicy: someLadder,
                fundedTradesPerDay: 3,
            });
            expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
                /fundedTradesPerDay/,
            );
        });

        it('throws when fundedCushionPercent and fundedRiskPerTrade are both set (no ladder)', () => {
            const inputs = baseInputs({
                fundedCushionPercent: fraction(0.1),
                fundedRiskPerTrade: 300,
            });
            expect(() => resolveDayPolicy(inputs, TradingPhase.Funded)).toThrow(
                /fundedRiskPerTrade/,
            );
        });

        it('never fires on the eval phase, regardless of which funded fields are set', () => {
            const inputs = baseInputs({
                fundedCushionPercent: fraction(0.1),
                fundedDayPolicy: someLadder,
                fundedRiskPerTrade: 300,
                fundedTradesPerDay: 3,
            });
            expect(() =>
                resolveDayPolicy(inputs, TradingPhase.Eval),
            ).not.toThrow();
        });

        it('does not throw for every combination the UI and CLI can currently produce', () => {
            expect(() =>
                assertNoFundedDayPolicyConflict({
                    fundedCushionPercent: undefined,
                    fundedDayPolicy: undefined,
                    fundedRiskPerTrade: undefined,
                    fundedTradesPerDay: undefined,
                }),
            ).not.toThrow();
            expect(() =>
                assertNoFundedDayPolicyConflict({
                    fundedCushionPercent: undefined,
                    fundedDayPolicy: undefined,
                    fundedRiskPerTrade: 300,
                    fundedTradesPerDay: 3,
                }),
            ).not.toThrow();
            expect(() =>
                assertNoFundedDayPolicyConflict({
                    fundedCushionPercent: fraction(0.1),
                    fundedDayPolicy: undefined,
                    fundedRiskPerTrade: undefined,
                    fundedTradesPerDay: 3,
                }),
            ).not.toThrow();
            expect(() =>
                resolveDayPolicy(
                    baseInputs({ evalDayPolicy: someLadder }),
                    TradingPhase.Eval,
                ),
            ).not.toThrow();
        });

        it(
            'does not throw for evalDayPolicy set together with riskPerTrade/' +
                "tradesPerDay -- this IS the CLI's own normal --ladder path, and " +
                'is deliberately out of scope for a hard error (see describe block)',
            () => {
                expect(() =>
                    resolveDayPolicy(
                        baseInputs({ evalDayPolicy: someLadder }),
                        TradingPhase.Eval,
                    ),
                ).not.toThrow();
            },
        );
    },
);
