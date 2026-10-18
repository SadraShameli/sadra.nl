import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    applyTrade,
    type AttemptDaySamples,
    closeTradingDay,
    type CouponDiscounts,
    DayStopRuleKind,
    evalStartStateIssue,
    FirmId,
    INSTRUMENTS,
    InstrumentSymbol,
    LADDER_EVAL_PASS_FLOOR,
    type LadderAttemptStats,
    type LadderScore,
    type LadderScoreConfig,
    ladderTrialStreams,
    MffuVariant,
    percent,
    type Plan,
    type PlanId,
    points,
    recordBestDay,
    remainingEvalSessions,
    replacementEconomicsFromState,
    resetForNewDay,
    RetryKind,
    retryPath,
    RungSizing,
    runLadderSearch,
    scoreLadder,
    subscriptionElapsedDaysIssue,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${JSON.stringify(id)} not found`);
    return plan;
}

const rapidEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
const apexIntraday = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});
const topStep = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const LADDER = [400, 600, 800, 200] as const;
const SEED = 42;
const SIMS = 500;
const GRID = { lo: 200, max: 800, slots: 1, step: 200 };

type Session = null | readonly number[];

function attemptStats(score: LadderScore): LadderAttemptStats {
    return {
        meanDaysOnFail: score.meanDaysOnFail,
        meanDaysOnPass: score.meanDaysOnPass,
        passRate: score.passRate,
        passRateStandardError: score.passRateStandardError,
    };
}

function config(
    plan: Plan,
    overrides: Partial<LadderScoreConfig> = {},
): LadderScoreConfig {
    return {
        commission: 0,
        cushion: plan.drawdown.amount,
        maxDays: 60,
        plan,
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims: SIMS,
        stopRule: { kind: DayStopRuleKind.DayGreen },
        winrate: 0.5,
        ...overrides,
    };
}

function fromState(
    plan: Plan,
    ladder: readonly number[],
    startState: AccountState,
    overrides: Partial<LadderScoreConfig> = {},
): LadderScore {
    return scoreLadder(
        ladder,
        config(plan, { ...overrides, startState }),
        ladderTrialStreams(SEED),
    );
}

function idleSessions(count: number): Session[] {
    return Array.from({ length: count }, () => null);
}

function lastApexSession(): AccountState {
    return replay(apexIntraday, idleSessions(20));
}

function replay(plan: Plan, sessions: readonly Session[]): AccountState {
    const state = plan.initialState();
    for (const trades of sessions) {
        resetForNewDay(state);
        const tradePnLs = trades ?? [];
        for (const pnl of tradePnLs) {
            applyTrade(plan, TradingPhase.Eval, state, pnl);
        }
        closeTradingDay(plan, TradingPhase.Eval, state, trades !== null);
        recordBestDay(state);
    }
    resetForNewDay(state);
    return state;
}

function tradedApexState(): AccountState {
    return replay(apexIntraday, [[300], [-200], [250]]);
}

const PINS = {
    apexIntraday: {
        ladder: {
            costPerFunded: 437.419452887538,
            costPerFundedStandardError: 12.21350311191506,
            expectedDaysToFunded: 6.009118541033434,
            expectedDaysToFundedStandardError: 0.17072609045267703,
            ladder: [400, 600, 800, 200],
            meanDaysOnFail: 2.8947368421052633,
            meanDaysOnPass: 4.504559270516717,
            passRate: 0.658,
            passRateStandardError: 0.021214900423994452,
        },
        search: {
            byCost: [[400], [600], [800], [200]],
            bySpeed: [[800], [600], [400], [200]],
            frontier: [[800], [600], [400]],
        },
        singles: {
            200: {
                costPerFunded: 867.4415584415584,
                costPerFundedStandardError: 54.4373806519709,
                expectedDaysToFunded: 63.53246753246753,
                expectedDaysToFundedStandardError: 4.598103347791361,
                ladder: [200],
                meanDaysOnFail: 20.98843930635838,
                meanDaysOnPass: 16.376623376623378,
                passRate: 0.308,
                passRateStandardError: 0.020646355610615643,
            },
            400: {
                costPerFunded: 428.43620178041544,
                costPerFundedStandardError: 11.501477182759004,
                expectedDaysToFunded: 17.71513353115727,
                expectedDaysToFundedStandardError: 0.7123539807002587,
                ladder: [400],
                meanDaysOnFail: 13.723926380368098,
                meanDaysOnPass: 11.077151335311573,
                passRate: 0.674,
                passRateStandardError: 0.020963015050321363,
            },
            600: {
                costPerFunded: 438.57317073170736,
                costPerFundedStandardError: 12.305337389344004,
                expectedDaysToFunded: 10.396341463414634,
                expectedDaysToFundedStandardError: 0.43851515855689305,
                ladder: [600],
                meanDaysOnFail: 7.558139534883721,
                meanDaysOnPass: 6.432926829268292,
                passRate: 0.656,
                passRateStandardError: 0.02124448163641561,
            },
            800: {
                costPerFunded: 478.1919191919192,
                costPerFundedStandardError: 15.520002340510246,
                expectedDaysToFunded: 8.17845117845118,
                expectedDaysToFundedStandardError: 0.3864941877413678,
                ladder: [800],
                meanDaysOnFail: 5.251231527093596,
                meanDaysOnPass: 4.589225589225589,
                passRate: 0.594,
                passRateStandardError: 0.021961967125009547,
            },
        },
    },
    rapidEod: {
        ladder: {
            costPerFunded: 311.0119047619047,
            costPerFundedStandardError: 9.726765762228695,
            expectedDaysToFunded: 6.050595238095237,
            expectedDaysToFundedStandardError: 0.17305595099738671,
            ladder: [400, 600, 800, 200],
            meanDaysOnFail: 2.957317073170732,
            meanDaysOnPass: 4.607142857142857,
            passRate: 0.672,
            passRateStandardError: 0.02099599961897504,
        },
        search: {
            byCost: [[200], [400], [600], [800]],
            bySpeed: [[800], [600], [400], [200]],
            frontier: [[800], [600], [400], [200]],
        },
        singles: {
            200: {
                costPerFunded: 225.21551724137927,
                costPerFundedStandardError: 2.805905004025149,
                expectedDaysToFunded: 32.37715517241379,
                expectedDaysToFundedStandardError: 0.8784203092049238,
                ladder: [200],
                meanDaysOnFail: 48.583333333333336,
                meanDaysOnPass: 28.607758620689655,
                passRate: 0.928,
                passRateStandardError: 0.0115599307956406,
            },
            400: {
                costPerFunded: 277.9255319148936,
                costPerFundedStandardError: 7.142445044772245,
                expectedDaysToFunded: 17.055851063829785,
                expectedDaysToFundedStandardError: 0.6043607214920411,
                ladder: [400],
                meanDaysOnFail: 12.975806451612904,
                meanDaysOnPass: 12.77659574468085,
                passRate: 0.752,
                passRateStandardError: 0.019313000802568203,
            },
            600: {
                costPerFunded: 332.80254777070064,
                costPerFundedStandardError: 11.468539316624998,
                expectedDaysToFunded: 14.52547770700637,
                expectedDaysToFundedStandardError: 0.5795646158672342,
                ladder: [600],
                meanDaysOnFail: 8.56989247311828,
                meanDaysOnPass: 9.449044585987261,
                passRate: 0.628,
                passRateStandardError: 0.021615549958305478,
            },
            800: {
                costPerFunded: 392.8571428571429,
                costPerFundedStandardError: 16.50750859465174,
                expectedDaysToFunded: 14.5,
                expectedDaysToFundedStandardError: 0.6208146198527279,
                ladder: [800],
                meanDaysOnFail: 6.294871794871795,
                meanDaysOnPass: 8.962406015037594,
                passRate: 0.532,
                passRateStandardError: 0.022314838112789434,
            },
        },
    },
} as const;

const PINNED_PLANS = [
    { name: 'MFF Rapid EOD 50K', pins: PINS.rapidEod, plan: rapidEod },
    {
        name: 'Apex Intraday 50K (21-session cap)',
        pins: PINS.apexIntraday,
        plan: apexIntraday,
    },
] as const;

const NEAR_TARGET_SESSIONS: readonly Session[] = [[700], [700], [650], [650]];

const FIFTEEN_SESSIONS_SOME_IDLE: readonly Session[] = [
    [150],
    [-100],
    null,
    [150],
    [-100],
    null,
    [150],
    [-100],
    null,
    [150],
    [-100],
    null,
    [150],
    [-100],
    null,
];

describe('scoreLadder without a start state keeps the fresh pins (PD-31, captured 2026-09-26)', () => {
    it.each(PINNED_PLANS)(
        '$name: scoreLadder equals its pin bit-exactly',
        ({ pins, plan }) => {
            expect(
                scoreLadder(LADDER, config(plan), ladderTrialStreams(SEED)),
            ).toStrictEqual(pins.ladder);
        },
    );

    it.each(PINNED_PLANS)(
        '$name: runLadderSearch on a 1-slot grid equals its pins bit-exactly',
        ({ pins, plan }) => {
            const result = runLadderSearch({
                grid: GRID,
                score: config(plan),
                seed: SEED,
            });
            const pinned = (ladders: readonly (readonly number[])[]) =>
                ladders.map(
                    ([rung]) =>
                        pins.singles[rung as keyof (typeof pins)['singles']],
                );
            expect(result.bySpeed).toStrictEqual(pinned(pins.search.bySpeed));
            expect(result.byCost).toStrictEqual(pinned(pins.search.byCost));
            expect(result.frontier).toStrictEqual(pinned(pins.search.frontier));
            expect(result.unscorableCount).toBe(0);
        },
    );
});

describe('scoreLadder from plan.initialState() (F-114 b)', () => {
    it.each(PINNED_PLANS)(
        '$name: reports the fresh stats exactly in freshAttempt',
        ({ pins, plan }) => {
            const score = fromState(plan, LADDER, plan.initialState());
            expect(score.freshAttempt).toStrictEqual(attemptStats(pins.ladder));
        },
    );

    it.each(PINNED_PLANS)(
        '$name: scores the current attempt within 3 SE of the fresh attempt',
        ({ plan }) => {
            const sims = 4000;
            const score = fromState(plan, LADDER, plan.initialState(), {
                sims,
            });
            const fresh = score.freshAttempt;
            if (fresh === undefined) throw new Error('freshAttempt missing');
            const passRateSe = Math.hypot(
                score.passRateStandardError,
                fresh.passRateStandardError,
            );
            expect(Math.abs(score.passRate - fresh.passRate)).toBeLessThan(
                3 * passRateSe,
            );
            expect(
                Math.abs(score.meanDaysOnPass - fresh.meanDaysOnPass),
            ).toBeLessThan(0.3);
            expect(
                Math.abs(score.meanDaysOnFail - fresh.meanDaysOnFail),
            ).toBeLessThan(0.3);
        },
    );

    it.each([...PINNED_PLANS, { name: 'TopStep 50K', plan: topStep }])(
        '$name: costs the fresh cost minus the sunk initial eval fee and first month, within SE',
        ({ plan }) => {
            const sims = 4000;
            const fresh = scoreLadder(
                LADDER,
                config(plan, { sims }),
                ladderTrialStreams(SEED),
            );
            const score = fromState(plan, LADDER, plan.initialState(), {
                sims,
            });
            const sunk = plan.fees.oneTimeEval + plan.fees.monthlySubscription;
            expect(
                Math.abs(score.costPerFunded - (fresh.costPerFunded - sunk)),
            ).toBeLessThan(
                3 *
                    Math.hypot(
                        score.costPerFundedStandardError,
                        fresh.costPerFundedStandardError,
                    ),
            );
        },
    );
});

describe('scoreLadder from a mid-eval state (F-114 c, d, e, f)', () => {
    it('from a state near the target passes more often and sooner than a fresh attempt', () => {
        const state = replay(rapidEod, NEAR_TARGET_SESSIONS);
        const score = fromState(rapidEod, LADDER, state);
        expect(score.passRate).toBeGreaterThan(PINS.rapidEod.ladder.passRate);
        expect(score.meanDaysOnPass).toBeLessThan(
            PINS.rapidEod.ladder.meanDaysOnPass,
        );
        expect(score.expectedDaysToFunded).toBeLessThan(
            PINS.rapidEod.ladder.expectedDaysToFunded,
        );
    });

    it.each([
        {
            name: 'MFF Rapid EOD near the target',
            plan: rapidEod,
            sessions: NEAR_TARGET_SESSIONS,
        },
        {
            name: 'Apex Intraday 15 sessions in',
            plan: apexIntraday,
            sessions: FIFTEEN_SESSIONS_SOME_IDLE,
        },
    ])(
        '$name: prices retries from freshAttempt through replacementEconomicsFromState, sunk fees excluded',
        ({ plan, sessions }) => {
            const state = replay(plan, sessions);
            const score = fromState(plan, LADDER, state);
            const fresh = score.freshAttempt;
            if (fresh === undefined) throw new Error('freshAttempt missing');
            const freshOnly = scoreLadder(
                LADDER,
                config(plan),
                ladderTrialStreams(SEED),
            );
            expect(fresh).toStrictEqual(attemptStats(freshOnly));
            const economics = replacementEconomicsFromState({
                current: {
                    meanDaysOnFail: score.meanDaysOnFail,
                    meanDaysOnPass: score.meanDaysOnPass,
                    passRate: score.passRate,
                    subscriptionElapsedDays: state.elapsedDays ?? 0,
                },
                fresh: {
                    discounts: undefined,
                    evalPassRate: fresh.passRate,
                    fees: plan.fees,
                    meanDaysOnFail: fresh.meanDaysOnFail,
                    meanDaysOnPass: fresh.meanDaysOnPass,
                },
            });
            expect(score.costPerFunded).toBeCloseTo(
                economics.costPerFundedAccount,
                9,
            );
            expect(score.expectedDaysToFunded).toBeCloseTo(
                economics.daysPerFundedAccount,
                9,
            );
            expect(score.costPerFunded).toBeCloseTo(
                plan.fees.activation +
                    (1 - score.passRate) * (plan.retryFee() / fresh.passRate),
                9,
            );
        },
    );

    it('prices a subscription plan with the same days as the helper applied to the reported estimates', () => {
        const state = replay(topStep, NEAR_TARGET_SESSIONS);
        const score = fromState(topStep, LADDER, state);
        const fresh = score.freshAttempt;
        if (fresh === undefined) throw new Error('freshAttempt missing');
        const economics = replacementEconomicsFromState({
            current: {
                meanDaysOnFail: score.meanDaysOnFail,
                meanDaysOnPass: score.meanDaysOnPass,
                passRate: score.passRate,
                subscriptionElapsedDays: state.elapsedDays ?? 0,
            },
            fresh: {
                discounts: undefined,
                evalPassRate: fresh.passRate,
                fees: topStep.fees,
                meanDaysOnFail: fresh.meanDaysOnFail,
                meanDaysOnPass: fresh.meanDaysOnPass,
            },
        });
        expect(score.expectedDaysToFunded).toBeCloseTo(
            economics.daysPerFundedAccount,
            9,
        );
        expect(score.costPerFunded).toBeGreaterThan(topStep.fees.activation);
    });

    it('caps the current attempt at evalDayCap - elapsedDays (sessions, idle included): Apex Intraday 15 sessions in has at most 6 left, and a timeout is a failure', () => {
        const state = replay(apexIntraday, FIFTEEN_SESSIONS_SOME_IDLE);
        expect(state.elapsedDays).toBe(15);
        expect(state.tradingDays).toBe(10);
        const score = fromState(apexIntraday, [200], state);
        expect(score.meanDaysOnPass).toBeLessThanOrEqual(6);
        expect(score.meanDaysOnFail).toBeLessThanOrEqual(6);
        expect(score.meanDaysOnFail).toBe(6);
        expect(score.passRate).toBeLessThan(0.5);
        expect(score.expectedDaysToFunded).toBeGreaterThan(
            score.meanDaysOnFail,
        );
    });

    it('propagates finite, positive standard errors over the six estimates', () => {
        for (const [plan, sessions] of [
            [rapidEod, NEAR_TARGET_SESSIONS],
            [apexIntraday, FIFTEEN_SESSIONS_SOME_IDLE],
            [topStep, NEAR_TARGET_SESSIONS],
        ] as const) {
            const score = fromState(plan, LADDER, replay(plan, sessions));
            expect(score.freshAttempt).toBeDefined();
            expect(Number.isFinite(score.costPerFundedStandardError)).toBe(
                true,
            );
            expect(score.costPerFundedStandardError).toBeGreaterThan(0);
            expect(
                Number.isFinite(score.expectedDaysToFundedStandardError),
            ).toBe(true);
            expect(score.expectedDaysToFundedStandardError).toBeGreaterThan(0);
        }
    });
});

const WIN = 0;
const LOSS = 0.99;
const SCRIPTED_RUNG = [500] as const;

type Script = readonly number[];

function scripted(
    fresh: readonly Script[],
    current: readonly Script[],
    overrides: Partial<LadderScoreConfig>,
): LadderScore {
    return scoreLadder(
        SCRIPTED_RUNG,
        config(topStep, { ...overrides, sims: fresh.length }),
        scriptedTrials(fresh, current),
    );
}

function scriptedTrials(
    fresh: readonly Script[],
    current: readonly Script[],
): (trial: number) => () => number {
    return (trial) => {
        const script =
            trial < fresh.length ? fresh[trial] : current[trial - fresh.length];
        if (script === undefined) {
            throw new Error(`no script for trial ${String(trial)}`);
        }
        let day = 0;
        return () => {
            const u = script[Math.min(day, script.length - 1)] ?? WIN;
            day += 1;
            return u;
        };
    };
}

function topStepAt(idleSessions: number): AccountState {
    return replay(topStep, [
        ...Array.from({ length: 19 }, () => [100]),
        ...Array.from({ length: idleSessions }, () => null),
    ]);
}

const CURRENT_SCRIPTS: readonly Script[] = [[WIN], [LOSS, WIN], [LOSS], [WIN]];
const CURRENT_DAYS: AttemptDaySamples = { failDays: [4], passDays: [2, 3, 2] };
const FRESH_SCRIPTS: readonly Script[] = [
    [WIN],
    [LOSS],
    [LOSS, LOSS, WIN],
    [LOSS],
];
const FRESH_DAYS: AttemptDaySamples = { failDays: [4, 4], passDays: [3, 6] };
const MONTHLY_COUPON: CouponDiscounts = {
    activationPercent: percent(0),
    evalPercent: percent(0),
    monthlySubscriptionPercent: percent(50),
};

function mean(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe('scoreLadder from a state feeds the sampled subscription to replacementEconomicsFromState (F-114 d, review)', () => {
    it.each([
        { discounts: undefined, name: 'renewal', retry: RetryKind.Reset },
        { discounts: MONTHLY_COUPON, name: 'rebuy', retry: RetryKind.Rebuy },
    ])(
        'TopStep $name, 19 sessions in: costs exactly the helper on the scripted current and fresh day samples',
        ({ discounts, retry }) => {
            expect(retryPath(topStep.fees, discounts)).toBe(retry);
            const state = topStepAt(0);
            expect(state.elapsedDays).toBe(19);
            const score = scripted(FRESH_SCRIPTS, CURRENT_SCRIPTS, {
                discounts,
                startState: state,
            });
            expect(attemptStats(score)).toStrictEqual({
                meanDaysOnFail: mean(CURRENT_DAYS.failDays),
                meanDaysOnPass: mean(CURRENT_DAYS.passDays),
                passRate: 0.75,
                passRateStandardError: score.passRateStandardError,
            });
            expect(score.freshAttempt).toStrictEqual({
                meanDaysOnFail: mean(FRESH_DAYS.failDays),
                meanDaysOnPass: mean(FRESH_DAYS.passDays),
                passRate: 0.5,
                passRateStandardError:
                    score.freshAttempt?.passRateStandardError,
            });
            const costWith = (
                current: AttemptDaySamples | undefined,
                fresh: AttemptDaySamples | undefined,
                subscriptionElapsedDays: number,
            ) =>
                replacementEconomicsFromState({
                    current: {
                        attemptDays: current,
                        meanDaysOnFail: mean(CURRENT_DAYS.failDays),
                        meanDaysOnPass: mean(CURRENT_DAYS.passDays),
                        passRate: 0.75,
                        subscriptionElapsedDays,
                    },
                    fresh: {
                        attemptDays: fresh,
                        discounts,
                        evalPassRate: 0.5,
                        fees: topStep.fees,
                        meanDaysOnFail: mean(FRESH_DAYS.failDays),
                        meanDaysOnPass: mean(FRESH_DAYS.passDays),
                    },
                }).costPerFundedAccount;
            const expected = costWith(CURRENT_DAYS, FRESH_DAYS, 19);
            expect(score.costPerFunded).toBeCloseTo(expected, 9);
            for (const miswired of [
                costWith(FRESH_DAYS, CURRENT_DAYS, 19),
                costWith(undefined, undefined, 19),
                costWith(CURRENT_DAYS, FRESH_DAYS, 0),
            ]) {
                expect(Math.abs(miswired - expected)).toBeGreaterThan(1);
            }
        },
    );

    it.each([
        { idle: 0, months: 0, name: '19 + 2 = 21 stays in month 1' },
        { idle: 1, months: 1, name: '20 + 2 = 22 opens month 2' },
    ])(
        'a sure pass on the 2nd remaining session costs activation plus $months more month(s): $name',
        ({ idle, months }) => {
            const score = scripted([[LOSS], [LOSS]], [[WIN], [WIN]], {
                startState: topStepAt(idle),
            });
            expect(score.passRate).toBe(1);
            expect(score.meanDaysOnPass).toBe(2);
            expect(score.costPerFunded).toBe(
                topStep.fees.activation +
                    months * topStep.fees.monthlySubscription,
            );
            expect(score.expectedDaysToFunded).toBe(2);
        },
    );

    it('pins rule (g) at pc = 1: scorable with zero cost and days SE even when a fresh attempt never passes', () => {
        const score = scripted([[LOSS], [LOSS]], [[WIN], [WIN]], {
            startState: topStepAt(0),
        });
        expect(score.freshAttempt?.passRate).toBe(0);
        expect(score.costPerFunded).toBe(topStep.fees.activation);
        expect(score.costPerFundedStandardError).toBe(0);
        expect(score.expectedDaysToFundedStandardError).toBe(0);
    });
});

describe('scoreLadder bills the running subscription from its own age (review: attempt age vs subscription age)', () => {
    it('defaults the billing offset to the attempt elapsedDays and prices a second attempt from config.subscriptionElapsedDays: 41 + 2 = 43 opens month 3', () => {
        const startState = topStepAt(0);
        const firstAttempt = scripted([[LOSS], [LOSS]], [[WIN], [WIN]], {
            startState,
        });
        const secondAttempt = scripted([[LOSS], [LOSS]], [[WIN], [WIN]], {
            startState,
            subscriptionElapsedDays: 41,
        });
        expect(firstAttempt.costPerFunded).toBe(topStep.fees.activation);
        expect(secondAttempt.meanDaysOnPass).toBe(2);
        expect(secondAttempt.costPerFunded).toBe(
            topStep.fees.activation + topStep.fees.monthlySubscription,
        );
    });

    it('keeps the day cap on the attempt elapsedDays, not the subscription age', () => {
        const startState = replay(apexIntraday, FIFTEEN_SESSIONS_SOME_IDLE);
        const score = fromState(apexIntraday, [200], startState, {
            subscriptionElapsedDays: 40,
        });
        expect(score.meanDaysOnFail).toBe(6);
    });

    it.each([
        { name: 'below the attempt elapsedDays', value: 18 },
        { name: 'fractional', value: 20.5 },
        { name: 'negative', value: -1 },
    ])(
        'throws naming subscriptionElapsedDays when it is $name',
        ({ value }) => {
            expect(() =>
                scripted([[LOSS], [LOSS]], [[WIN], [WIN]], {
                    startState: topStepAt(0),
                    subscriptionElapsedDays: value,
                }),
            ).toThrow(/subscriptionElapsedDays/);
        },
    );

    it('throws when subscriptionElapsedDays is given without a startState', () => {
        expect(() =>
            scoreLadder(
                LADDER,
                config(topStep, { subscriptionElapsedDays: 30 }),
                ladderTrialStreams(SEED),
            ),
        ).toThrow(/subscriptionElapsedDays needs a startState/);
    });
});

describe('scoreLadder from a state: scorability (F-114 g)', () => {
    it('stays scorable when the current attempt is below the floor but a fresh attempt is not', () => {
        const score = fromState(apexIntraday, [200], lastApexSession());
        expect(score.passRate).toBeLessThan(LADDER_EVAL_PASS_FLOOR);
        expect(score.freshAttempt?.passRate).toBeGreaterThanOrEqual(
            LADDER_EVAL_PASS_FLOOR,
        );
        expect(Number.isFinite(score.costPerFunded)).toBe(true);
        expect(Number.isFinite(score.expectedDaysToFunded)).toBe(true);
    });

    it('is unscorable when the current attempt can fail and a fresh attempt is below the floor', () => {
        const score = fromState(apexIntraday, [200], lastApexSession(), {
            winrate: 0.2,
        });
        expect(score.freshAttempt?.passRate).toBeLessThan(
            LADDER_EVAL_PASS_FLOOR,
        );
        expect(score.costPerFunded).toBe(Infinity);
        expect(score.costPerFundedStandardError).toBe(Infinity);
        expect(score.expectedDaysToFunded).toBe(Infinity);
        expect(score.expectedDaysToFundedStandardError).toBe(Infinity);
    });
});

describe('runLadderSearch from a state (F-114 h, i)', () => {
    it('ranks on the from-state values: near the target on MFF Rapid EOD (30% consistency) the small rungs are fastest, the reverse of the fresh order', () => {
        const startState = replay(rapidEod, NEAR_TARGET_SESSIONS);
        const result = runLadderSearch({
            grid: GRID,
            score: config(rapidEod, { startState }),
            seed: SEED,
        });
        const expected = [200, 400, 600, 800]
            .map((rung) => fromState(rapidEod, [rung], startState))
            .toSorted(
                (a, b) => a.expectedDaysToFunded - b.expectedDaysToFunded,
            );
        expect(result.bySpeed).toStrictEqual(expected);
        expect(result.bySpeed.map((score) => score.ladder)).toStrictEqual([
            [400],
            [200],
            [600],
            [800],
        ]);
        expect(PINS.rapidEod.search.bySpeed).toStrictEqual([
            [800],
            [600],
            [400],
            [200],
        ]);
    });

    it('draws current-attempt trial k from trialRng(sims + k), keeps the fresh draws and shares streams across ladders', () => {
        const startState = replay(apexIntraday, FIFTEEN_SESSIONS_SOME_IDLE);
        const streams = ladderTrialStreams(SEED);
        const requested = new Map<string, number[]>();
        for (const ladder of [LADDER, [600]]) {
            const trials: number[] = [];
            scoreLadder(
                ladder,
                config(apexIntraday, { startState }),
                (trial) => {
                    trials.push(trial);
                    return streams(trial);
                },
            );
            requested.set(ladder.join(','), trials);
        }
        const expected = Array.from({ length: 2 * SIMS }, (_, index) => index);
        expect(requested.get(LADDER.join(','))).toStrictEqual(expected);
        expect(requested.get('600')).toStrictEqual(expected);
    });
});

describe('scoreLadder refuses an invalid eval start (F-114 j)', () => {
    const cases: readonly {
        message: RegExp;
        name: string;
        state: () => AccountState;
    }[] = [
        {
            message: /busted/,
            name: 'a busted start',
            state: () => replay(apexIntraday, [[-2100]]),
        },
        {
            message: /passed/,
            name: 'a passed start',
            state: () => replay(apexIntraday, [[1600], [1500]]),
        },
        {
            message: /eval-day cap/,
            name: 'a start at the eval-day cap',
            state: () => replay(apexIntraday, idleSessions(21)),
        },
        {
            message: /elapsedDays is missing/,
            name: 'a start without elapsedDays',
            state: () => {
                const state = tradedApexState();
                delete state.elapsedDays;
                return state;
            },
        },
        {
            message: /below tradingDays/,
            name: 'elapsedDays below tradingDays',
            state: () => ({ ...tradedApexState(), elapsedDays: 2 }),
        },
        {
            message: /whole number/,
            name: 'fractional elapsedDays',
            state: () => ({ ...tradedApexState(), elapsedDays: 3.5 }),
        },
        {
            message: /todayPnL/,
            name: 'a start mid-day',
            state: () => {
                const state = tradedApexState();
                applyTrade(apexIntraday, TradingPhase.Eval, state, 100);
                return state;
            },
        },
        {
            message: /startingBalance/,
            name: 'a startingBalance off the account size',
            state: () => ({
                ...tradedApexState(),
                startingBalance: apexIntraday.accountSize + 1,
            }),
        },
    ];

    it.each(cases)(
        'throws naming the reason for $name',
        ({ message, state }) => {
            expect(() => fromState(apexIntraday, LADDER, state())).toThrow(
                message,
            );
            expect(evalStartStateIssue(apexIntraday, state(), 60)).toMatch(
                message,
            );
        },
    );

    it('accepts a replayed mid-eval state and the initial state', () => {
        expect(
            evalStartStateIssue(apexIntraday, tradedApexState(), 60),
        ).toBeNull();
        expect(
            evalStartStateIssue(apexIntraday, apexIntraday.initialState(), 60),
        ).toBeNull();
    });

    it('validates against the requested window on a plan without a firm eval-day cap', () => {
        const state = replay(rapidEod, idleSessions(10));
        expect(evalStartStateIssue(rapidEod, state, 11)).toBeNull();
        const issue = evalStartStateIssue(rapidEod, state, 10);
        expect(issue).toMatch(/simulation horizon \(maxDays 10\)/);
        expect(issue).not.toMatch(/eval-day cap/);
    });

    it('names the simulation horizon, not the firm cap, when the requested window is shorter than the firm eval-day cap', () => {
        const issue = evalStartStateIssue(
            apexIntraday,
            replay(apexIntraday, idleSessions(10)),
            10,
        );
        expect(issue).toMatch(/simulation horizon \(maxDays 10\)/);
        expect(issue).not.toMatch(/eval-day cap/);
    });

    it('counts the sessions left under the window and refuses an invalid start, from the core barrel', () => {
        const state = replay(rapidEod, idleSessions(4));
        expect(remainingEvalSessions(rapidEod, state, 11)).toBe(7);
        expect(() => remainingEvalSessions(rapidEod, state, 4)).toThrow(
            /invalid eval start state: .*simulation horizon/,
        );
    });

    it('accepts a subscription at least as old as the attempt and names a younger one, from the core barrel', () => {
        const state = replay(rapidEod, idleSessions(4));
        expect(subscriptionElapsedDaysIssue(state, 4)).toBeNull();
        expect(subscriptionElapsedDaysIssue(state, 9)).toBeNull();
        expect(subscriptionElapsedDaysIssue(state, 3)).toMatch(
            /subscriptionElapsedDays must be a whole number >= the attempt elapsedDays \(4\), got 3/,
        );
    });
});

describe('scoreLadder from a state keeps eval sizing ContractCapped (F-114 k, T33)', () => {
    it('places the intended $150 rung at 3.75 MNQ, not 3 whole contracts: from $600 up, a sure win of $300 a day passes the $3,000 target in exactly 8 more sessions', () => {
        const score = fromState(
            apexIntraday,
            [150],
            replay(apexIntraday, [[300], [300]]),
            {
                positionSizing: {
                    instrument: INSTRUMENTS[InstrumentSymbol.MNQ],
                    stopPoints: points(20),
                },
                winrate: 1,
            },
        );
        expect(score.freshAttempt?.meanDaysOnPass).toBe(10);
        expect(score.passRate).toBe(1);
        expect(score.meanDaysOnPass).toBe(8);
    });
});
