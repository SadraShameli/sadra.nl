import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    computeEvalStateValue,
    contracts,
    DailyLossLimitKind,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    isEvalDpEligible,
    LucidVariant,
    MffuVariant,
    type Plan,
    points,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

function apexIntradayPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Intraday,
    });
    if (!plan) throw new Error('Apex Intraday 50K plan not found');
    return plan;
}

function baseBuilderPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K plan not found');
    return plan;
}

function lucidDailyIntradayPlan(): Plan {
    const plan = new LucidTrading().findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.DailyIntraday,
    });
    if (!plan) throw new Error('Lucid DailyIntraday 50K plan not found');
    return plan;
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function toyDpConfig(
    plan: Plan,
    maxEvalDays: number,
    maxActionDollars: number,
) {
    return {
        actionStepDollars: 50,
        cushionStepDollars: 50,
        maxActionDollars,
        maxEvalDays,
        plan,
        profitStepDollars: 50,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: fraction(0.5),
    };
}

function toyPlan(profitTarget: number): Plan {
    return baseBuilderPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        maxEvalTradingDays: undefined,
        minTradingDays: 0,
        profitTarget: dollars(profitTarget),
    });
}

describe('computeEvalStateValue backward induction — hand-computable toy cases', () => {
    it(
        'accountSize 1000 / drawdown 100 (cushion 100, threshold 900) / ' +
            'profitTarget 50 / one slot / one day: betting $50 at 1:2 either ' +
            'reaches profit 200 (pass) or drops to profit -50 without busting ' +
            '(cushion 50 > 0), then times out — a terminal-value-only closed ' +
            'form (V(pass)=1, V(timeout)=0) collapses to V(initial) = winrate',
        () => {
            const plan = toyPlan(50);
            expect(isEvalDpEligible(plan)).toBe(true);

            const result = computeEvalStateValue(toyDpConfig(plan, 1, 50));

            expect(result.initialValue).toBeCloseTo(0.5, 10);
        },
    );

    it(
        'same account with profitTarget raised to 250 (unreachable in one day ' +
            'without an all-in bet) over a 2-day cap: hand backward induction ' +
            'gives V(day2 | cushion=100, thresholdOffset=100, reached after a ' +
            'day-1 $100 win) = 0.5 (an all-in $100 bet on day 2 either passes ' +
            'at profit 300 or busts at cushion 0), V(day2 | cushion=50, ' +
            'thresholdOffset=0, reached after a day-1 loss) = 0 (no single day-2 ' +
            'trade reaches profit 250 from there), so day 1 betting $50 or $100 ' +
            'both give 0.5*0.5 + 0.5*0 = 0.25, strictly beating the 0 from not ' +
            'betting on day 1 — V(initial) = 0.25 exactly, threading the real ' +
            'EodTrailingDrawdown ratchet and the bust-vs-timeout distinction ' +
            'through two linked days',
        () => {
            const plan = toyPlan(250);

            const result = computeEvalStateValue(toyDpConfig(plan, 2, 100));

            expect(result.initialValue).toBeCloseTo(0.25, 10);
        },
    );

    it(
        'the wired computeRisk actually risks capital on day one instead of ' +
            'the dominated stop action, matching the hand-derived optimal policy',
        () => {
            const plan = toyPlan(250);
            const result = computeEvalStateValue(toyDpConfig(plan, 2, 100));

            const initialState = plan.initialState();
            const risk = result.dayPolicy.computeRisk?.(initialState, 0);
            expect(risk).toBe(50);
        },
    );

    it(
        'extending the day cap can only raise V(initial), since every extra ' +
            'day is one more nonzero-probability chance to reach the passing ' +
            "region before the horizon's own timeout, never a reason to do worse",
        () => {
            const plan = toyPlan(250);
            const shortHorizon = computeEvalStateValue(
                toyDpConfig(plan, 2, 100),
            );
            const longerHorizon = computeEvalStateValue(
                toyDpConfig(plan, 3, 100),
            );

            expect(longerHorizon.initialValue).toBeGreaterThan(
                shortHorizon.initialValue,
            );
        },
    );

    it(
        'accountSize 1000 / drawdown 100 / profitTarget 150 / one slot / one ' +
            'day, with contractLimits.evalMinis capped to 1 contract on ES ' +
            '(pointValue $50) at a 1-point stop: the nominal $100 action is ' +
            "capRiskToContractLimit'd down to $50 before resolveTradeRisk " +
            'ever sees it (resolveContractLimit(..., TradingPhase.Eval, ...) ' +
            'then capRiskToContractLimit, the literal engine functions, in ' +
            "the engine's own order), so neither win ($100 profit) nor lose " +
            '(-$50) reaches the $150 target within the one-day cap — ' +
            "V(initial) = 0, strictly less than the uncapped $100 bet's " +
            'winrate-only V = 0.5, proving the contract-limit cap actually ' +
            "changed the DP's decision, not just that it ran without throwing",
        () => {
            const uncapped = toyPlan(150);
            const uncappedResult = computeEvalStateValue(
                toyDpConfig(uncapped, 1, 100),
            );
            expect(uncappedResult.initialValue).toBeCloseTo(0.5, 10);

            const capped = uncapped.withOverrides({
                contractLimits: {
                    evalMicros: null,
                    evalMinis: contracts(1),
                    fundedMicros: null,
                    fundedMinis: null,
                },
            });
            const cappedResult = computeEvalStateValue({
                ...toyDpConfig(capped, 1, 100),
                positionSizing: {
                    instrument: INSTRUMENTS[InstrumentSymbol.ES],
                    stopPoints: points(1),
                },
            });

            expect(cappedResult.initialValue).toBeCloseTo(0, 10);
        },
    );
});

describe(
    'computeEvalStateValue vs simulate() — real-plan integration ' +
        "(pass-probability level: L1's terminalValueAtPass defaults to 1, " +
        "so V(initial) is a pass-probability functional, not yet L2's " +
        'dollar-valued expectedNet — that requires wiring V(pass) to ' +
        "V_funded, which is L2's job per the plan's own sequencing note)",
    () => {
        it(
            "a DP-driven run's empirical simulate() pass rate matches the " +
                "DP's own predicted V(initial state) within Monte Carlo " +
                'tolerance, for a real registered plan (MFF Rapid EOD 50K, ' +
                'not a synthetic toy) — a short horizon and coarser grid ' +
                'steps keep this fast; the toy suite above already proves ' +
                'the backward induction itself is exact at fine resolution, ' +
                'so this test only has to prove the DP-to-simulate() wiring ' +
                'is faithful, which holds at any discretisation',
            () => {
                const plan = rapidEodPlan();
                const maxEvalDays = 10;
                const rrRatio = 2;
                const winrate = 0.4;
                const tradesPerDay = 4;
                const stopRule = { kind: DayStopRuleKind.DayGreen } as const;

                const dp = computeEvalStateValue({
                    actionStepDollars: 100,
                    cushionStepDollars: 200,
                    maxEvalDays,
                    plan,
                    profitStepDollars: 600,
                    rrRatio,
                    stopRule,
                    tradesPerDay,
                    winrate: fraction(winrate),
                });

                const out = simulate({
                    evalDayPolicy: dp.dayPolicy,
                    fundedHorizonDays: 1,
                    maxEvalDays,
                    plan,
                    riskPerTrade: 250,
                    rrRatio,
                    seed: 42,
                    tradesPerDay,
                    trials: 20_000,
                    winrate,
                });

                expect(out.passProbability).toBeCloseTo(dp.initialValue, 1);
            },
            30_000,
        );
    },
);

describe(
    'L1 validation harness — DP-computed policy vs the current static ' +
        "ladder, both driven through the real simulate(), per the plan's " +
        'own "do not trust the DP math in isolation" requirement (pass-' +
        "rate metric only at this L1 stage; L2's expectedNet comparison " +
        'is a separate, later job)',
    () => {
        it(
            'MFF Rapid EOD 50K, at a 30-day eval cap: the DP beats the ' +
                'documented speed-optimal static ladder ([400, 600, 800, 200], ' +
                "the same ladder scored in ladderSearch.test.ts's golden " +
                "values) by well over the plan's own 3-percentage-point " +
                'adopt threshold, at matched seed/trial count — an explicit ' +
                'adopt verdict, not an assumed one',
            () => {
                const plan = rapidEodPlan();
                const maxEvalDays = 30;
                const rrRatio = 2;
                const winrate = 0.4;
                const tradesPerDay = 4;
                const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
                const ADOPT_THRESHOLD_PP = 0.03;

                const staticLadderPolicy: DayPolicy = {
                    ladder: [400, 600, 800, 200],
                    maxLossesPerDay: null,
                    stopRule,
                };

                const dp = computeEvalStateValue({
                    actionStepDollars: 100,
                    cushionStepDollars: 200,
                    maxEvalDays,
                    plan,
                    profitStepDollars: 600,
                    rrRatio,
                    stopRule,
                    tradesPerDay,
                    winrate: fraction(winrate),
                });

                const simConfig = {
                    fundedHorizonDays: 1,
                    maxEvalDays,
                    plan,
                    riskPerTrade: 250,
                    rrRatio,
                    seed: 42,
                    tradesPerDay,
                    trials: 20_000,
                    winrate,
                };

                const ladderOut = simulate({
                    ...simConfig,
                    evalDayPolicy: staticLadderPolicy,
                });
                const dpOut = simulate({
                    ...simConfig,
                    evalDayPolicy: dp.dayPolicy,
                });

                expect(dpOut.passProbability).toBeCloseTo(dp.initialValue, 1);
                expect(ladderOut.passProbability).toBeCloseTo(0.429, 2);
                expect(dpOut.passProbability).toBeCloseTo(0.588, 2);
                expect(
                    dpOut.passProbability - ladderOut.passProbability,
                ).toBeGreaterThan(ADOPT_THRESHOLD_PP);
            },
            45_000,
        );
    },
);

describe('isEvalDpEligible / computeEvalStateValue scope cut', () => {
    it(
        "excludes Apex's intraday-trailing eval plan, per the plan's explicit " +
            'v1 scope cut (full DP fidelity is only exact for EOD-trailing plans)',
        () => {
            const plan = apexIntradayPlan();
            expect(isEvalDpEligible(plan)).toBe(false);
        },
    );

    it('fails loud instead of silently computing a wrong policy for an ineligible plan', () => {
        const plan = apexIntradayPlan();
        expect(() =>
            computeEvalStateValue({
                maxEvalDays: 21,
                plan,
                rrRatio: 2,
                winrate: fraction(0.4),
            }),
        ).toThrow(/not eligible/);
    });

    it(
        "also excludes Lucid's second, independent eval-level " +
            'IntradayTrailingDrawdown plan family (LucidDaily Intraday), ' +
            'confirming the scope cut is a generic DrawdownKind check, not ' +
            "hardcoded to Apex's variant",
        () => {
            const plan = lucidDailyIntradayPlan();
            expect(isEvalDpEligible(plan)).toBe(false);
            expect(() =>
                computeEvalStateValue({
                    maxEvalDays: 21,
                    plan,
                    rrRatio: 2,
                    winrate: fraction(0.4),
                }),
            ).toThrow(/not eligible/);
        },
    );
});
