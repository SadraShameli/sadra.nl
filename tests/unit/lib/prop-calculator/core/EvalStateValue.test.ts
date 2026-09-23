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

function lucidDailyIntradayDllPlan(): Plan {
    const plan = new LucidTrading().findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.DailyIntradayDll,
    });
    if (!plan) throw new Error('Lucid DailyIntradayDll 50K plan not found');
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
            'the dominated stop action ($50 and $100 are hand-derived as an ' +
            "exact tie here, both giving V=0.25, so this pins the DP's " +
            'deterministic tie-break to the lower, first-encountered action, ' +
            'not a claim that $50 uniquely beats $100; the contract-limit ' +
            'test below is the case with a genuinely unique optimum',
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
            120_000,
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
            200_000,
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

    it(
        "also excludes Lucid's DailyIntradayDll variant, a second, " +
            'independently-registered IntradayTrailingDrawdown plan distinct ' +
            'from plain DailyIntraday (same drawdown kind, different Daily ' +
            'Loss Limit configuration)',
        () => {
            const plan = lucidDailyIntradayDllPlan();
            expect(isEvalDpEligible(plan)).toBe(false);
        },
    );

    it(
        'excludes a plan whose eval daily loss limit depends on peak-day-' +
            'close profit, independent of the drawdown-kind check (the base ' +
            'plan here uses EodTrailingDrawdown, which alone is DP-eligible), ' +
            "so this isolates isEvalDpEligible's second, otherwise-untested " +
            'disqualifying condition',
        () => {
            const plan = baseBuilderPlan().withOverrides({
                evalDailyLossLimit: {
                    kind: DailyLossLimitKind.PeakProfitShare,
                    share: fraction(0.5),
                },
            });
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

    it(
        'a real, currently idle-limited eval plan (MFF Rapid EOD 50K, ' +
            'maxConsecutiveIdleDays=7) is DP-eligible — isEvalDpEligible ' +
            'never excluded on maxConsecutiveIdleDays to begin with (it only ' +
            'checks drawdown kind and the peak-share daily-loss-limit ' +
            'dependency), so this pins idle-limited plans as eligible while ' +
            "confirming the other exclusion categories (Apex's " +
            'IntradayTrailingDrawdown, peak-share DLL — both covered by the ' +
            'scope-cut cases above) stay excluded, independent of ' +
            'maxConsecutiveIdleDays',
        () => {
            const idleLimitedPlan = rapidEodPlan();
            expect(idleLimitedPlan.maxConsecutiveIdleDays).not.toBeNull();
            expect(isEvalDpEligible(idleLimitedPlan)).toBe(true);

            expect(isEvalDpEligible(apexIntradayPlan())).toBe(false);

            const peakShareDllPlan = baseBuilderPlan().withOverrides({
                evalDailyLossLimit: {
                    kind: DailyLossLimitKind.PeakProfitShare,
                    share: fraction(0.5),
                },
            });
            expect(isEvalDpEligible(peakShareDllPlan)).toBe(false);
        },
    );
});

describe('idle-days DP state dimension', () => {
    it(
        'plans without maxConsecutiveIdleDays set are byte-for-byte ' +
            'unaffected by the idle-days dimension: this exact config ' +
            '(toyPlan(250), 2-day cap, actionGrid [50,100]) was measured ' +
            'against the unmodified pre-idle-days engine at ' +
            'initialValue=0.25, reachedStateCount=17, risk@0=50 (matching ' +
            "the existing hand-derived 'two linked days' toy case above) — " +
            'asserting those exact, previously-measured figures here pins ' +
            'the post-change engine to produce identical output for every ' +
            'plan that never sets the field',
        () => {
            const plan = toyPlan(250).withOverrides({
                maxConsecutiveIdleDays: undefined,
            });
            expect(plan.maxConsecutiveIdleDays).toBeNull();

            const result = computeEvalStateValue(toyDpConfig(plan, 2, 100));

            expect(result.initialValue).toBeCloseTo(0.25, 10);
            expect(result.reachedStateCount).toBe(17);

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(50);
        },
    );

    it(
        'accountSize 1000 / drawdown 100 / profitTarget 0 / minTradingDays ' +
            '0 (deliberately already satisfied on its own, so it cannot ' +
            'itself force any trading — this isolates the idle-days effect ' +
            'from the separate tradingDays gate covered by its own ' +
            'describe block below) / maxConsecutiveIdleDays 1 / 2-day cap / ' +
            'one $50-at-1:2 slot per day: with minTradingDays 0, idling is ' +
            'a free, guaranteed pass (profit stays 0 >= profitTarget 0) ' +
            'whenever nothing else forces a trade — proven directly below ' +
            'by clearing maxConsecutiveIdleDays to null on the identical ' +
            'config (V=1, decided at the very first day close, no need to ' +
            'reach the 2-day cap at all). But maxConsecutiveIdleDays=1 ' +
            'busts on the very first idle day, so the real engine is ' +
            'forced to trade day 1 instead: hand backward induction — day1 ' +
            'win (p=0.5, profit +$100, EodTrailingDrawdown ratchets ' +
            'threshold 900->1000) passes immediately (profit 100 >= 0, ' +
            'V=1); day1 loss (p=0.5, profit -$50, threshold stays 900, ' +
            'cushion 50) is not yet passing (profit -50 < 0) and, since ' +
            'idling day 2 would immediately bust too, is forced to trade ' +
            'again — day2 win (profit 50 >= 0, V=1) or lose (balance 900 ' +
            '== threshold 900, V=0), a coin flip — total V(initial) = ' +
            '0.5*1 + 0.5*(0.5*1 + 0.5*0) = 0.75, a real bust the old, ' +
            'idle-blind DP would have missed entirely (it would have ' +
            'reported the impossible-in-practice V=1). (This test used to ' +
            'set minTradingDays 2 instead of 0 and relied on the ' +
            'tradingDays-counts-every-calendar-day bug to make its own ' +
            'idle-blind reference point read V=1 — fixing that bug (see ' +
            "the 'tradingDays DP state dimension' describe block) made " +
            'minTradingDays 2 force the same two trading days on its own, ' +
            'independent of maxConsecutiveIdleDays, collapsing both arms of ' +
            'that comparison to the same 0.75 and destroying the contrast; ' +
            'minTradingDays 0 restores a clean, single-variable comparison)',
        () => {
            const basePlan = toyPlan(0).withOverrides({ minTradingDays: 0 });

            const idleBlindEquivalent = basePlan.withOverrides({
                maxConsecutiveIdleDays: undefined,
            });
            expect(idleBlindEquivalent.maxConsecutiveIdleDays).toBeNull();
            const idleBlindResult = computeEvalStateValue(
                toyDpConfig(idleBlindEquivalent, 2, 50),
            );
            expect(idleBlindResult.initialValue).toBeCloseTo(1, 10);

            const plan = basePlan.withOverrides({ maxConsecutiveIdleDays: 1 });
            expect(plan.maxConsecutiveIdleDays).toBe(1);
            const result = computeEvalStateValue(toyDpConfig(plan, 2, 50));

            expect(result.initialValue).toBeCloseTo(0.75, 10);
            expect(result.initialValue).toBeLessThan(
                idleBlindResult.initialValue,
            );

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(50);
        },
    );
});

describe('tradingDays DP state dimension', () => {
    it(
        'accountSize 1000 / drawdown 100 / profitTarget 0 / minTradingDays ' +
            '1 / maxConsecutiveIdleDays null / 1-day cap / one $50-at-1:2 ' +
            "slot: pins tradingDays to simulator/day.ts's real semantics — " +
            '`state.tradingDays += 1` only `if (isTraded)` (day.ts:186-189), ' +
            'never unconditionally per calendar day. Idling day 0 reaches ' +
            'the 1-day cap having traded zero real days, so tradingDays ' +
            'stays 0 and minTradingDays 1 is never satisfied — V(idle ' +
            'branch) = 0 (times out, does not pass), even though profit is ' +
            'a trivially-passing 0 and one full calendar day elapsed. The ' +
            'prior bug (`state.tradingDays = day + 1` unconditionally, ' +
            'ignoring wasIdleToday) would have credited that elapsed ' +
            'calendar day as a trading day and wrongly reported V=1 for ' +
            'the idle branch. Trading instead (the only other option) ' +
            "risks the plan's $100 drawdown for a real shot at passing: " +
            'win reaches profit 100 with tradingDays 1, passing ' +
            'immediately (V=1); lose reaches profit -50, fails the profit ' +
            'target, and the 1-day cap times out (V=0) — so trading is ' +
            "worth exactly the winrate (0.5), strictly beating idling's 0, " +
            'and the DP must correctly prefer it over the free-looking, ' +
            'actually-dead-end idle action',
        () => {
            const plan = toyPlan(0).withOverrides({
                maxConsecutiveIdleDays: undefined,
                minTradingDays: 1,
            });
            expect(plan.maxConsecutiveIdleDays).toBeNull();

            const result = computeEvalStateValue(toyDpConfig(plan, 1, 50));

            expect(result.initialValue).toBeCloseTo(0.5, 10);

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(50);
        },
    );

    it(
        'the identical config with minTradingDays reset to 0 collapses ' +
            'back to the trivial free pass (tradingDays(0) < ' +
            'minTradingDays(0) is false immediately, regardless of whether ' +
            'any real trade ever happens), confirming the 0.5 result above ' +
            'comes specifically from the minTradingDays gate rejecting an ' +
            'idle-only day, not from some other difference in this config, ' +
            'and that the new tradingDays dimension is a true no-op — ' +
            'exactly the "collapses to a smaller/no-op range once the cap ' +
            'is reached" pattern already used for idleDays and ' +
            "payoutRegimeCap — whenever a plan doesn't set minTradingDays",
        () => {
            const plan = toyPlan(0).withOverrides({
                maxConsecutiveIdleDays: undefined,
                minTradingDays: 0,
            });

            const result = computeEvalStateValue(toyDpConfig(plan, 1, 50));

            expect(result.initialValue).toBeCloseTo(1, 10);

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(0);
        },
    );
});

describe('elapsedDays DP state dimension', () => {
    it(
        'accountSize 1000 / drawdown 100 / profitTarget 0 / minTradingDays ' +
            '1 / maxConsecutiveIdleDays 3 / 2-day cap / one $50-at-1:2 ' +
            "slot: computeRisk's within-day lookup must key off real " +
            'elapsed calendar days, not off state.tradingDays — the two ' +
            'diverge the moment a real day passes without a trade (e.g. an ' +
            'idle day forced externally by idleDayProbability, independent ' +
            "of what this day's own policy would have recommended). A " +
            'hand-built state representing "day 1, after one such forced-' +
            'idle day 0" (elapsedDays 1, tradingDays still 0, ' +
            'consecutiveIdleDays 1) must get the same forced-to-trade $50 ' +
            "recommendation day 0's own initial state gets: with only one " +
            'day left before the 2-day cap and minTradingDays 1 still ' +
            'unmet, idling again guarantees a timeout, exactly the ' +
            "reasoning the 'tradingDays DP state dimension' block above " +
            'proves for day 0 itself. The bug this pins — computeRisk ' +
            'substituting state.tradingDays for elapsed days — would ' +
            'instead build a day=0/idleDays=1 lookup key that the backward ' +
            'induction never populates (day 0 only ever has idleDays 0), ' +
            'silently falling back to a phantom "skip" recommendation (0) ' +
            'instead of the real day-1 policy',
        () => {
            const plan = toyPlan(0).withOverrides({
                maxConsecutiveIdleDays: 3,
                minTradingDays: 1,
            });

            const result = computeEvalStateValue(toyDpConfig(plan, 2, 50));

            const day0Risk = result.dayPolicy.computeRisk?.(
                plan.initialState(),
                0,
            );
            expect(day0Risk).toBe(50);

            const day1AfterForcedIdleState = {
                ...plan.initialState(),
                consecutiveIdleDays: 1,
                elapsedDays: 1,
            };
            const day1Risk = result.dayPolicy.computeRisk?.(
                day1AfterForcedIdleState,
                0,
            );
            expect(day1Risk).toBe(50);
        },
    );
});

describe('dayCost DP dimension', () => {
    it(
        'accountSize 1000 / drawdown 100 (cushion 100, threshold 900) / ' +
            'profitTarget 50 / one slot / one day, with a constant dayCost ' +
            'c charged once at the start of the only playable day: betting ' +
            '$50 at 1:2 either passes (terminal value 1, no further day is ' +
            'ever played, so no further charge) or loses to cushion 50 ' +
            '(not a bust) and then times out at the 1-day cap, which is ' +
            'the uncharged branch since no day beyond the cap is consumed. ' +
            'So the raw grid value for day 0 is exactly the winrate, 0.5, ' +
            'unaffected by c, and the single day-0 charge is subtracted ' +
            'exactly once on top: V(initial) = 0.5 - c',
        () => {
            const c = 0.1;
            const plan = toyPlan(50);

            const result = computeEvalStateValue({
                ...toyDpConfig(plan, 1, 50),
                dayCost: () => c,
            });

            expect(result.initialValue).toBeCloseTo(0.5 - c, 10);
        },
    );

    it(
        'the same profitTarget-250, 2-day-cap toy that hand-derives to an ' +
            'exact $50/$100 tie at V=0.25 with no dayCost: a constant ' +
            'dayCost c breaks that tie in favor of $100, because a $100 ' +
            'loss on day 1 lands cushion exactly at 0, an intraday bust ' +
            'that returns raw 0 without ever playing (and paying for) day ' +
            '2, while a $50 loss survives to cushion 50 and is forced to ' +
            'play a second, separately-charged day that can never reach ' +
            'the target from there. Both bet sizes still reach the same ' +
            'day-2 win-branch value of 0.5 - c on a day-1 win (an all-in ' +
            'day-2 bet either passes for terminal value 1 or busts ' +
            'intraday for 0, so that branch is itself dayCost-invariant). ' +
            'So the $50 raw grid value is 0.5*(0.5 - c) + 0.5*(-c) = ' +
            '0.25 - c, while the $100 raw grid value is 0.5*(0.5 - c) + ' +
            '0.5*0 = 0.25 - 0.5c, strictly higher for any c > 0. The DP ' +
            'must pick $100 and the day-0 charge lands on top of that ' +
            'higher raw value once more: V(initial) = ' +
            '(0.25 - 0.5c) - c = 0.25 - 1.5c, strictly less than the no-' +
            'cost 0.25, and computeRisk at the initial state flips from ' +
            'the old tie-broken 50 to the now strictly-better 100. This ' +
            'fails if intraday busts are left uncharged in a way that ' +
            'keeps day 1 tied (0.25 - c, computeRisk still 50) or if a ' +
            "day's cost is applied more than once for the same elapsed day",
        () => {
            const c = 0.1;
            const plan = toyPlan(250);

            const result = computeEvalStateValue({
                ...toyDpConfig(plan, 2, 100),
                dayCost: () => c,
            });

            expect(result.initialValue).toBeCloseTo(0.25 - 1.5 * c, 10);

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(100);
        },
    );
});
