import { describe, expect, it } from 'vitest';

import {
    accountConclusionGate,
    type AccountState,
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    dollars,
    FirmId,
    fraction,
    type FundedCycleTracker,
    type FundedPayoutOptions,
    LucidVariant,
    MffuVariant,
    newFundedCycleTracker,
    PayoutDayGateBasis,
    type PayoutEvaluation,
    PayoutEvaluationKind,
    PayoutFloorEffect,
    PayoutGate,
    PayoutRequestPolicy,
    type Plan,
    type PlanId,
    profitShareMultiplier,
    serializePlanId,
    TopStepVariant,
    withOneTimeEarlyWithdrawalTaken,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';

interface CushionPin {
    keepsRetainedCushion: boolean;
    postPayoutCushion: number;
}

interface PayoutPin {
    causesHardBreach: boolean;
    debited: number;
    traderReceives: number;
}

interface Scenario {
    build: () => {
        options: FundedPayoutOptions;
        tracker: FundedCycleTracker;
    };
    expected: PayoutEvaluation;
    name: string;
    pin: null | PayoutPin;
}

const START = 50_000;
const LOCKED_FLOOR = 50_100;

function blocked(gate: PayoutGate): PayoutEvaluation {
    return { gate, kind: PayoutEvaluationKind.Blocked };
}

function calendarGatedPlan(): Plan {
    return rapidEod().withOverrides({
        minDaysAfterPassForPayout: 7,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(1),
        payoutDayGateBasis:
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
    });
}

function eligible(
    pin: PayoutPin,
    cushion: CushionPin,
    isEarlyWithdrawal = false,
): PayoutEvaluation {
    return {
        ...pin,
        ...cushion,
        isEarlyWithdrawal,
        kind: PayoutEvaluationKind.Eligible,
    };
}

function exhaustedLadder(plan: Plan): {
    options: FundedPayoutOptions;
    tracker: FundedCycleTracker;
} {
    const built = lockedRapidEod(10_000, {}, plan);
    built.tracker.payoutsIssued = 5;
    built.tracker.qualifyingDaysAtLastPayout =
        built.options.state.qualifyingDays;
    return built;
}

function flexLikeLadderPlan(): Plan {
    return rapidEod().withOverrides({
        minPayoutProfit: dollars(500),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: [2000, 2000, 2000, 2000, 2000],
        },
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
    });
}

function fundedConsistencyPlan(): Plan {
    return rapidEod().withOverrides({
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.2),
        ),
        minPayoutRequest: dollars(1),
    });
}

function lockedFunded(
    plan: Plan,
    profit: number,
    threshold = LOCKED_FLOOR,
): { state: AccountState; tracker: FundedCycleTracker } {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = START + profit;
    state.threshold = threshold;
    state.thresholdLocked = true;
    state.qualifyingDays = 99;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = START;
    tracker.qualifyingDaysAtLastPayout = 0;
    return { state, tracker };
}

function lockedRapidEod(
    profit: number,
    overrides: Partial<FundedPayoutOptions> = {},
    plan: Plan = rapidEod(),
) {
    const { state, tracker } = lockedFunded(plan, profit);
    return { options: options(plan, state, overrides), tracker };
}

function mffPro(): Plan {
    return registryPlan({
        accountSize: START,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
}

function options(
    plan: Plan,
    state: AccountState,
    overrides: Partial<FundedPayoutOptions> = {},
): FundedPayoutOptions {
    return {
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
        ...overrides,
    };
}

function rapidEod(): Plan {
    return registryPlan({
        accountSize: START,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function topStep(): Plan {
    return registryPlan({
        accountSize: START,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
}

function unlockedPro(profit: number): {
    options: FundedPayoutOptions;
    tracker: FundedCycleTracker;
} {
    const plan = withOneTimeEarlyWithdrawalTaken(mffPro(), true);
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = START + profit;
    state.threshold = START + profit - plan.fundedDrawdown.amount;
    state.thresholdLocked = false;
    state.qualifyingDays = 20;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = START;
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.sessionDaysSinceAnchor = 20;
    return {
        options: {
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        },
        tracker,
    };
}

const RAPID_EOD_FULL_PIN = {
    causesHardBreach: false,
    debited: 2900,
    traderReceives: 2610,
};

const SCENARIOS: readonly Scenario[] = [
    {
        build: () => lockedRapidEod(3000),
        expected: eligible(RAPID_EOD_FULL_PIN, {
            keepsRetainedCushion: true,
            postPayoutCushion: 0,
        }),
        name: 'MFF Rapid EOD pays everything above the locked floor with no request size',
        pin: RAPID_EOD_FULL_PIN,
    },
    {
        build: () => lockedRapidEod(3000, { payoutRequestSize: 500 }),
        expected: eligible(
            { causesHardBreach: false, debited: 500, traderReceives: 450 },
            { keepsRetainedCushion: true, postPayoutCushion: 2400 },
        ),
        name: 'MFF Rapid EOD pays a $500 request in full',
        pin: { causesHardBreach: false, debited: 500, traderReceives: 450 },
    },
    {
        build: () => {
            const plan = rapidEod().withOverrides({
                fullWithdrawalHardBreach: true,
            });
            const { state, tracker } = lockedFunded(plan, 3000, 49_000);
            return { options: options(plan, state), tracker };
        },
        expected: eligible(
            { causesHardBreach: true, debited: 3000, traderReceives: 2700 },
            { keepsRetainedCushion: true, postPayoutCushion: 1000 },
        ),
        name: 'a full-withdrawal hard-breach plan reports the breach on an eligible payout of all profit',
        pin: { causesHardBreach: true, debited: 3000, traderReceives: 2700 },
    },
    {
        build: () => unlockedPro(2000),
        expected: eligible(
            { causesHardBreach: false, debited: 1200, traderReceives: 960 },
            { keepsRetainedCushion: true, postPayoutCushion: 700 },
            true,
        ),
        name: 'MFF Pro with the early-withdrawal opt-in takes 60% of $2,000 profit before the buffer clears',
        pin: { causesHardBreach: false, debited: 1200, traderReceives: 960 },
    },
    {
        build: () => {
            const built = unlockedPro(2000);
            built.options.minRetainedCushion = 2000;
            return built;
        },
        expected: eligible(
            { causesHardBreach: false, debited: 1200, traderReceives: 960 },
            { keepsRetainedCushion: false, postPayoutCushion: 700 },
            true,
        ),
        name: 'MFF Pro early withdrawal ignores a $2,000 retained cushion by the documented rule and reports the $700 it leaves above the locked floor',
        pin: { causesHardBreach: false, debited: 1200, traderReceives: 960 },
    },
    {
        build: () => {
            const plan = topStep();
            const { state, tracker } = lockedFunded(plan, 1200, 49_200);
            state.thresholdLocked = false;
            return {
                options: options(plan, state, { minRetainedCushion: 1000 }),
                tracker,
            };
        },
        expected: eligible(
            { causesHardBreach: false, debited: 600, traderReceives: 510 },
            { keepsRetainedCushion: false, postPayoutCushion: 600 },
        ),
        name: 'TopStep ReleaseFloor pays the engine room of $600 against the current floor and reports that the released floor leaves $600 of a $1,000 retained cushion (Q13 default)',
        pin: { causesHardBreach: false, debited: 600, traderReceives: 510 },
    },
    {
        build: () => {
            const plan = rapidEod().withOverrides({
                maxLifetimePayoutDollars: dollars(1000),
            });
            const built = lockedRapidEod(
                3000,
                {},
                plan.withMaxLifetimePayouts(1),
            );
            built.tracker.cumulativePayout = 1000;
            built.tracker.payoutsIssued = 1;
            return built;
        },
        expected: blocked(PayoutGate.LifetimeDollarCapReached),
        name: 'the lifetime dollar cap comes first, even when the payout count is reached too',
        pin: null,
    },
    {
        build: () => {
            const plan = rapidEod().withOverrides({
                maxLifetimePayoutDollars: dollars(1000),
            });
            const built = lockedRapidEod(3000, {}, plan);
            built.tracker.cumulativePayout = 1000;
            return built;
        },
        expected: blocked(PayoutGate.LifetimeDollarCapReached),
        name: 'the lifetime dollar cap blocks once trader-received payouts reach it',
        pin: null,
    },
    {
        build: () => {
            const plan = fundedConsistencyPlan().withMaxLifetimePayouts(1);
            const built = lockedRapidEod(3000, {}, plan);
            built.tracker.payoutsIssued = 1;
            built.tracker.cycleBestDayProfit = 2000;
            return built;
        },
        expected: blocked(PayoutGate.AccountConcluded),
        name: 'a concluded account comes before a consistency breach',
        pin: null,
    },
    {
        build: () => {
            const built = lockedRapidEod(
                3000,
                {},
                rapidEod().withMaxLifetimePayouts(1),
            );
            built.tracker.payoutsIssued = 1;
            return built;
        },
        expected: blocked(PayoutGate.AccountConcluded),
        name: 'withMaxLifetimePayouts(1) blocks after one payout, a state the funded loop and the DP conclude at before asking again',
        pin: null,
    },
    {
        build: () => {
            const built = lockedRapidEod(3000, {}, fundedConsistencyPlan());
            built.tracker.cycleBestDayProfit = 1000;
            built.options.state.qualifyingDays = 0;
            return built;
        },
        expected: blocked(PayoutGate.FundedConsistency),
        name: 'a funded consistency breach comes before an unmet day gate',
        pin: null,
    },
    {
        build: () => {
            const built = lockedRapidEod(
                3000,
                {},
                rapidEod().withOverrides({ minDaysAfterPassForPayout: 5 }),
            );
            built.options.state.qualifyingDays = 3;
            return built;
        },
        expected: blocked(PayoutGate.DayGateNotMet),
        name: 'the qualifying-day gate blocks with 3 of 5 days',
        pin: null,
    },
    {
        build: () => {
            const plan = calendarGatedPlan();
            const built = lockedRapidEod(3000, {}, plan);
            built.tracker.sessionDaysSinceAnchor = 4;
            return built;
        },
        expected: blocked(PayoutGate.DayGateNotMet),
        name: 'the calendar-day gate blocks at 4 of the 5 sessions that 7 calendar days make',
        pin: null,
    },
    {
        build: () => lockedRapidEod(2099),
        expected: blocked(PayoutGate.BelowMinPayoutProfit),
        name: 'MFF Rapid EOD blocks $2,099 of profit below its $2,100 first-payout minimum',
        pin: null,
    },
    {
        build: () => unlockedPro(200),
        expected: blocked(PayoutGate.EarlyWithdrawalBelowFloor),
        name: 'MFF Pro early withdrawal of 60% of $200 would leave the balance on the post-payout floor',
        pin: null,
    },
    {
        build: () => unlockedPro(1000),
        expected: blocked(PayoutGate.EarlyWithdrawalBelowMinimum),
        name: 'MFF Pro early withdrawal of 60% of $1,000 is below its $1,000 minimum',
        pin: null,
    },
    {
        build: () => lockedRapidEod(3000, { minRetainedCushion: 2900 }),
        expected: blocked(PayoutGate.NothingWithdrawable),
        name: 'a retained cushion that covers all room above the floor leaves nothing withdrawable',
        pin: null,
    },
    {
        build: () => {
            const built = lockedRapidEod(10_000, {}, flexLikeLadderPlan());
            built.tracker.payoutsIssued = 5;
            return built;
        },
        expected: blocked(PayoutGate.LadderExhausted),
        name: 'a five-step ladder that does not cap at its last step is exhausted after five payouts',
        pin: null,
    },
    {
        build: () => exhaustedLadder(flexLikeLadderPlan()),
        expected: blocked(PayoutGate.LadderExhausted),
        name: 'an exhausted ladder comes before an unmet day gate, since no payout can ever follow',
        pin: null,
    },
    {
        build: () => {
            const built = exhaustedLadder(flexLikeLadderPlan());
            built.tracker.cycleBestDayProfit = 10_000;
            built.options.plan = built.options.plan.withOverrides({
                consistency: new ConsistencyRule(
                    ConsistencyScope.Funded,
                    fraction(0.2),
                ),
            });
            return built;
        },
        expected: blocked(PayoutGate.LadderExhausted),
        name: 'an exhausted ladder comes before a funded consistency breach',
        pin: null,
    },
    {
        build: () =>
            exhaustedLadder(
                flexLikeLadderPlan().withOverrides({ maxLifetimePayouts: 8 }),
            ),
        expected: blocked(PayoutGate.LadderExhausted),
        name: 'an exhausted ladder comes first even when a lifetime payout count above the ladder length leaves the account open',
        pin: null,
    },
    {
        build: () => {
            const plan = registryPlan({
                accountSize: START,
                firm: FirmId.Apex,
                variant: ApexVariant.Eod,
            });
            const { state, tracker } = lockedFunded(plan, 3000, START + 2100);
            return { options: options(plan, state), tracker };
        },
        expected: blocked(PayoutGate.LadderStepUnaffordable),
        name: 'Apex EOD denies its $1,500 step when only $900 is above the buffer',
        pin: null,
    },
    {
        build: () => lockedRapidEod(2200, { minRetainedCushion: 1800 }),
        expected: blocked(PayoutGate.BelowMinRequest),
        name: 'MFF Rapid EOD blocks $300 of room below its $500 minimum request',
        pin: null,
    },
    {
        build: () => {
            const plan = topStep();
            const { state, tracker } = lockedFunded(plan, 800, 48_000);
            state.thresholdLocked = false;
            return {
                options: options(plan, state, {
                    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                    payoutRequestSize: 500,
                }),
                tracker,
            };
        },
        expected: blocked(PayoutGate.BelowFullRequest),
        name: 'TopStep under FullRequestOnly waits when its 50% balance-share cap leaves $400 of a $500 request',
        pin: null,
    },
];

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function expectEvaluationClose(
    actual: PayoutEvaluation,
    expected: PayoutEvaluation,
): void {
    expect(actual.kind).toBe(expected.kind);
    if (
        actual.kind === PayoutEvaluationKind.Blocked ||
        expected.kind === PayoutEvaluationKind.Blocked
    ) {
        expect(actual).toStrictEqual(expected);
        return;
    }
    expect(actual.isEarlyWithdrawal).toBe(expected.isEarlyWithdrawal);
    expect(actual.keepsRetainedCushion).toBe(expected.keepsRetainedCushion);
    expect(actual.postPayoutCushion).toBeCloseTo(expected.postPayoutCushion, 9);
    expectPayoutClose(actual, expected);
}

function expectPayoutClose(
    actual: null | PayoutPin,
    expected: null | PayoutPin,
): void {
    if (expected === null) {
        expect(actual).toBeNull();
        return;
    }
    expect(actual).not.toBeNull();
    expect(actual?.causesHardBreach).toBe(expected.causesHardBreach);
    expect(actual?.debited).toBeCloseTo(expected.debited, 9);
    expect(actual?.traderReceives).toBeCloseTo(expected.traderReceives, 9);
}

function trackerFields(tracker: FundedCycleTracker): FundedCycleTracker {
    return structuredClone(tracker);
}

describe('FundedCycleTracker.evaluatePayout reports every payout gate without mutating anything (F-110)', () => {
    it.each(SCENARIOS)('$name', ({ build, expected }) => {
        const { options: payoutOptions, tracker } = build();
        const stateBefore = structuredClone(payoutOptions.state);
        const trackerBefore = trackerFields(tracker);

        expectEvaluationClose(tracker.evaluatePayout(payoutOptions), expected);

        expect(payoutOptions.state).toStrictEqual(stateBefore);
        expect(trackerFields(tracker)).toStrictEqual(trackerBefore);
    });

    it.each(SCENARIOS)(
        'gives the same answer with the policy omitted and set to UpToRequest: $name',
        ({ build }) => {
            const { options: payoutOptions, tracker } = build();
            if (payoutOptions.payoutRequestPolicy !== undefined) return;

            expect(
                tracker.evaluatePayout({
                    ...payoutOptions,
                    payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
                }),
            ).toStrictEqual(tracker.evaluatePayout(payoutOptions));
        },
    );

    it('covers every PayoutGate member with a table row', () => {
        const covered = new Set(
            SCENARIOS.flatMap(({ expected }) =>
                expected.kind === PayoutEvaluationKind.Blocked
                    ? [expected.gate]
                    : [],
            ),
        );
        expect([...covered].toSorted(byName)).toStrictEqual(
            Object.values(PayoutGate).toSorted(byName),
        );
    });
});

describe('FundedCycleTracker.tryPayout settles exactly what evaluatePayout reports and keeps the working-tree pins', () => {
    it.each(SCENARIOS)('$name', ({ build, expected, pin }) => {
        const { options: payoutOptions, tracker } = build();

        const payout = tracker.tryPayout(payoutOptions);

        expectPayoutClose(payout, pin);
        if (expected.kind === PayoutEvaluationKind.Eligible) {
            expectPayoutClose(payout, {
                causesHardBreach: expected.causesHardBreach,
                debited: expected.debited,
                traderReceives: expected.traderReceives,
            });
        }
    });

    it.each(SCENARIOS)(
        'leaves the state and tracker untouched when blocked: $name',
        ({ build, expected }) => {
            if (expected.kind !== PayoutEvaluationKind.Blocked) return;
            const { options: payoutOptions, tracker } = build();
            const stateBefore = structuredClone(payoutOptions.state);
            const trackerBefore = trackerFields(tracker);

            expect(tracker.tryPayout(payoutOptions)).toBeNull();

            expect(payoutOptions.state).toStrictEqual(stateBefore);
            expect(trackerFields(tracker)).toStrictEqual(trackerBefore);
        },
    );

    it('concludes a withMaxLifetimePayouts(1) account at one payout, so the new AccountConcluded refusal is never reached by the funded loop', () => {
        const plan = rapidEod().withMaxLifetimePayouts(1);
        const { state, tracker } = lockedFunded(plan, 3000);

        const payout = tracker.tryPayout(options(plan, state));

        expectPayoutClose(payout, RAPID_EOD_FULL_PIN);
        expect(plan.isAccountConcluded(tracker.payoutsIssued)).toBe(true);
    });
});

describe('accountConclusionGate is the one account-conclusion rule, and names why the account is closed', () => {
    const synthetic: readonly Plan[] = [
        flexLikeLadderPlan(),
        flexLikeLadderPlan().withMaxLifetimePayouts(8),
        flexLikeLadderPlan().withOverrides({ maxLifetimePayouts: 8 }),
        rapidEod().withOverrides({ maxLifetimePayoutDollars: dollars(1000) }),
        registryPlan({
            accountSize: START,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        }).withOverrides({ maxLifetimePayouts: 5 }),
    ];
    const plans = [
        ...ALL_FIRMS.flatMap((firm) => firm.plans),
        ...synthetic,
    ].map((plan, index) => ({ plan, title: `${index} ${plan.label}` }));

    it.each(plans)(
        'agrees with Plan.isAccountConcluded on $title',
        ({ plan }) => {
            for (let payoutsIssued = 0; payoutsIssued <= 12; payoutsIssued++) {
                for (const cumulativePayout of [0, 999.99, 1000, 100_000]) {
                    expect(
                        accountConclusionGate(
                            plan.lifetimeConclusion,
                            payoutsIssued,
                            cumulativePayout,
                        ) !== null,
                        `${payoutsIssued} payouts, $${cumulativePayout}`,
                    ).toBe(
                        plan.isAccountConcluded(
                            payoutsIssued,
                            cumulativePayout,
                        ),
                    );
                }
            }
        },
    );

    it('reports the dollar cap before the payout count, and the count before the ladder', () => {
        const capped = flexLikeLadderPlan()
            .withOverrides({ maxLifetimePayoutDollars: dollars(1000) })
            .withMaxLifetimePayouts(5);
        expect(accountConclusionGate(capped, 5, 1000)).toBe(
            PayoutGate.LifetimeDollarCapReached,
        );
        expect(accountConclusionGate(capped, 5, 0)).toBe(
            PayoutGate.AccountConcluded,
        );
        expect(accountConclusionGate(flexLikeLadderPlan(), 5, 0)).toBe(
            PayoutGate.LadderExhausted,
        );
        expect(accountConclusionGate(flexLikeLadderPlan(), 4, 0)).toBeNull();
    });
});
