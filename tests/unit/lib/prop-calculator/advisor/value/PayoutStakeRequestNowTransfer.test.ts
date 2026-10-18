import { beforeAll, describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    type EnginePolicy,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import { toSimInputs } from '~/lib/prop-calculator/advisor/policy';
import {
    MilestoneKind,
    milestoneState,
    payoutStakeComparison,
    type PayoutStakeComparisonResult,
    requestNowValue,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import {
    type AccountState,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TRADING_DAYS_PER_YEAR,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    findFirm,
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/firms';
import {
    resolveDayPolicy,
    simulateLiveAccount,
} from '~/lib/prop-calculator/simulator';

const HAZARD = 0.3;
const HEAVY_TEST_TIMEOUT_MS = 10_000;
const ORACLE_SEED = 987_654;
const ORACLE_SEED_STRIDE = 1_000_003;
const ORACLE_TRIALS = 1000;
const PRICED_TRIALS = 150;

function fundedAccount(
    plan: Plan,
    overrides: Partial<AccountState> = {},
): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    Object.assign(state, overrides);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function postPayoutOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
) {
    const milestone = milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error('expected a funded milestone');
    }
    return requestNowValue(account, milestone, spec);
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function specOf(
    plan: Plan,
    hazards: Partial<Record<FirmId, number>>,
    overrides: Partial<EnginePolicy> = {},
): DocumentedPolicySpec {
    return {
        enginePolicy: {
            ...buildEnginePolicy({
                fundedHorizonDays: 90,
                plan,
                rulebook: DEFAULT_RULEBOOK,
            }).policy,
            ...overrides,
        },
        rulebook: {
            ...DEFAULT_RULEBOOK,
            liveTransfer: { hazardPerPaidPayoutByFirm: hazards },
        },
        run: { maxEvalDays: 40, seed: 5, trials: 60 },
    };
}

function stakeOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): PayoutStakeComparisonResult {
    const outcome = payoutStakeComparison(account, spec);
    if (outcome.kind !== ValueResultKind.PayoutStake) {
        throw new Error('expected a payout stake comparison');
    }
    return outcome;
}

const SIZED = { instrument: InstrumentSymbol.MNQ, stopPoints: 10 } as const;

describe('the request-now figure prices the requested payout own transfer draw (PT-73f step 5)', () => {
    const plan = rapidEodPlan();
    const account = fundedAccount(plan, { balance: 53_000 });

    describe('with no hazard', () => {
        const spec = specOf(plan, {});
        let stake: PayoutStakeComparisonResult;

        beforeAll(() => {
            stake = stakeOf(account, spec);
        });

        it('is the value after the payout plus the cash received, as before', () => {
            const { requestNow, traderReceives } = postPayoutOf(account, spec);

            expect(stake.requestNow.creditFree).toStrictEqual(
                requestNow.creditFree,
            );
            expect(stake.requestNow.creditInclusive).toStrictEqual(
                requestNow.creditInclusive,
            );
            expect(stake.traderReceivesNow).toBe(traderReceives);
        });

        it('is a value result that carries no assumption', () => {
            expect(stake.requestNow.kind).toBe(ValueResultKind.Value);
            expect('liveTransfer' in stake.requestNow).toBe(false);
        });
    });

    describe('with a hazard and no modeled live plan (the rest is valued at $0)', () => {
        const spec = specOf(plan, { [FirmId.Mffu]: HAZARD });
        let stake: PayoutStakeComparisonResult;
        let after: ReturnType<typeof postPayoutOf>;

        beforeAll(() => {
            stake = stakeOf(account, spec);
            after = postPayoutOf(account, spec);
        });

        it('is the cash plus (1 - h) times the value after the payout', () => {
            const cash = after.traderReceives;
            expect(stake.requestNow.creditFree.value).toBeCloseTo(
                cash + (1 - HAZARD) * after.continuation.creditFree.value,
                6,
            );
            expect(stake.requestNow.creditInclusive.value).toBeCloseTo(
                cash + (1 - HAZARD) * after.continuation.creditInclusive.value,
                6,
            );
        });

        it('scales the standard error of the value after the payout by (1 - h)', () => {
            const continuationError =
                after.continuation.creditFree.standardError;
            expect(continuationError).not.toBeNull();
            expect(stake.requestNow.creditFree.standardError).toBeCloseTo(
                (1 - HAZARD) * (continuationError ?? 0),
                6,
            );
        });

        it('lowers the request-now minus continue gap by h times the value after the payout', () => {
            const unpricedGap =
                after.traderReceives +
                after.continuation.creditFree.value -
                stake.continueNow.creditFree.value;
            const pricedGap =
                stake.requestNow.creditFree.value -
                stake.continueNow.creditFree.value;

            expect(pricedGap).toBeCloseTo(
                unpricedGap - HAZARD * after.continuation.creditFree.value,
                6,
            );
            expect(pricedGap).toBeLessThan(unpricedGap);
        });

        it('carries the hazard, the continuation and the notes of the continue run, and the share sent live of its own draw', () => {
            const { liveTransfer } = stake.requestNow;
            const postShare = after.continuation.liveTransfer?.sentLiveShare;
            expect(postShare).toBeDefined();
            expect(liveTransfer).toStrictEqual({
                ...stake.continueNow.liveTransfer,
                sentLiveShare: HAZARD + (1 - HAZARD) * (postShare ?? 0),
            });
        });

        it('leaves the cash and the requested amount untouched', () => {
            expect(stake.traderReceivesNow).toBe(after.traderReceives);
        });

        it('is what the exported construction returns to a caller that builds the milestone itself', () => {
            const milestone = milestoneState(account, spec);
            if (milestone.kind !== MilestoneKind.Funded) {
                throw new Error('expected a funded milestone');
            }

            const built = requestNowValue(account, milestone, spec);

            expect(built.requestNow).toEqual(stake.requestNow);
            expect(built.traderReceives).toBe(stake.traderReceivesNow);
        });
    });

    describe('with a hazard and a modeled live plan', () => {
        const spec = specOf(plan, { [FirmId.Mffu]: HAZARD }, SIZED);
        let stake: PayoutStakeComparisonResult;
        let after: ReturnType<typeof postPayoutOf>;

        beforeAll(() => {
            stake = stakeOf(account, spec);
            after = postPayoutOf(account, spec);
        });

        it('adds h times the live value on top of cash plus (1 - h) times the value after the payout', () => {
            const unliveValue =
                after.traderReceives +
                (1 - HAZARD) * after.continuation.creditFree.value;
            const liveValue =
                (stake.requestNow.creditFree.value - unliveValue) / HAZARD;

            expect(Number.isFinite(liveValue)).toBe(true);
            expect(liveValue).toBeGreaterThan(0);
        });

        it('values the live continuation at the same amount on both credit bases', () => {
            const unliveFree =
                after.traderReceives +
                (1 - HAZARD) * after.continuation.creditFree.value;
            const unliveInclusive =
                after.traderReceives +
                (1 - HAZARD) * after.continuation.creditInclusive.value;

            expect(stake.requestNow.creditFree.value - unliveFree).toBeCloseTo(
                stake.requestNow.creditInclusive.value - unliveInclusive,
                6,
            );
        });

        it(
            'values the live continuation like an independent live-account simulation of the same plan and horizon',
            () => {
                const oracleSpec = {
                    ...spec,
                    run: { ...spec.run, trials: PRICED_TRIALS },
                };
                const priced = stakeOf(account, oracleSpec);
                const afterOracle = postPayoutOf(account, oracleSpec);
                const base = toSimInputs(plan, oracleSpec);
                const applicability = livePlanApplicability(plan.id);
                if (applicability.kind !== LiveApplicabilityKind.Builder) {
                    throw new Error('expected a builder live plan');
                }
                const { instrument, stopPoints } = base;
                if (instrument === undefined || stopPoints === undefined) {
                    throw new Error('expected a sized run');
                }
                const livePlan = applicability.builder(
                    applicability.defaultCushionPercent,
                );
                const tradesPerDay = resolveDayPolicy(base, TradingPhase.Funded)
                    .ladder.length;
                const oracleRecurring = Array.from(
                    { length: ORACLE_TRIALS },
                    (_, trial) =>
                        (simulateLiveAccount({
                            commissionPerRoundTrip: base.commissionPerRoundTrip,
                            horizonDays: base.fundedHorizonDays,
                            idleDayProbability: base.idleDayProbability,
                            instrument,
                            payoutRequestSize: base.payoutRequestSize,
                            plan: livePlan,
                            retainedCushion: base.minRetainedCushion,
                            rrRatio: base.fundedRrRatio ?? base.rrRatio,
                            seed: ORACLE_SEED + trial * ORACLE_SEED_STRIDE,
                            stopPoints,
                            tradesPerDay,
                            trials: 1,
                            winrate: base.winrate,
                        }).expectedAnnualWithdrawalRate *
                            base.fundedHorizonDays) /
                        TRADING_DAYS_PER_YEAR,
                );
                const oracleValue =
                    oracleRecurring.reduce((sum, value) => sum + value, 0) /
                    ORACLE_TRIALS;
                const oracleError = Math.sqrt(
                    oracleRecurring.reduce(
                        (sum, value) => sum + (value - oracleValue) ** 2,
                        0,
                    ) /
                        (ORACLE_TRIALS - 1) /
                        ORACLE_TRIALS,
                );
                const pricedValue =
                    (priced.requestNow.creditFree.value -
                        afterOracle.traderReceives -
                        (1 - HAZARD) *
                            afterOracle.continuation.creditFree.value) /
                    HAZARD;
                const requestError = priced.requestNow.creditFree.standardError;
                const continuationError =
                    afterOracle.continuation.creditFree.standardError;
                expect(requestError).not.toBeNull();
                expect(continuationError).not.toBeNull();
                const liveError =
                    Math.sqrt(
                        (requestError ?? 0) ** 2 -
                            ((1 - HAZARD) * (continuationError ?? 0)) ** 2,
                    ) / HAZARD;

                expect(liveError).toBeGreaterThan(0);
                expect(oracleError).toBeGreaterThan(0);
                expect(oracleValue).toBeGreaterThan(0);
                expect(Math.abs(pricedValue - oracleValue)).toBeLessThan(
                    5 * Math.hypot(liveError, oracleError) + 0.05 * oracleValue,
                );
            },
            HEAVY_TEST_TIMEOUT_MS,
        );

        it('gives a finite standard error for the priced figure', () => {
            expect(
                Number.isFinite(
                    stake.requestNow.creditFree.standardError ?? NaN,
                ),
            ).toBe(true);
        });

        it('is the same figure on a rerun with the same seed', () => {
            expect(stakeOf(account, spec).requestNow).toStrictEqual(
                stake.requestNow,
            );
        });
    });
});
