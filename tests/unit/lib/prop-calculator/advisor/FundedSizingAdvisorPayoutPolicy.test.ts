import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    effectivePayoutRequest,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    applyEnginePolicy,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    type DifferenceReasonDetail,
    EngineOptimumRefusalKind,
    EngineOptimumRowKind,
    type EngineOptimumRunnerResult,
    type FundedFromStateEngineOptimumResult,
    FundedFromStateOptimumResultKind,
    FundedSizingAdvisor,
    type PayoutSizeSweepEngineOptimumResult,
    PayoutSizeSweepResultKind,
    type PersonalPayoutOverrideWarning,
    type ReconstructedFundedOrEvalAccount,
    RetainedCushionBasis,
    type RulebookParameters,
    runEngineOptimum,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { FundedCandidateRefusal } from '~/lib/prop-calculator/optimize';

const TOPSTEP_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const LOW_REQUEST_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    payout: { ...DEFAULT_RULEBOOK.payout, requestCents: 10_000 },
};

type PayoutPolicyDiffersReason = Extract<
    DifferenceReasonDetail,
    { kind: DifferenceReason.PayoutPolicyDiffers }
>;

function account(): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function accountState(): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function advisorWith(
    options: {
        readonly personalPayoutOverride?: number;
        readonly rulebook?: RulebookParameters;
    } = {},
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: account(),
        fundedHorizonDays: 252,
        personalPayoutOverride:
            options.personalPayoutOverride === undefined
                ? null
                : dollars(options.personalPayoutOverride),
        rulebook: options.rulebook ?? DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function enginePolicyReasons(
    reasons: readonly DifferenceReasonDetail[],
): readonly PayoutPolicyDiffersReason[] {
    return reasons.flatMap((reason) =>
        reason.kind === DifferenceReason.PayoutPolicyDiffers ? [reason] : [],
    );
}

function fromStateResultOf(
    results: readonly EngineOptimumRunnerResult[],
): FundedFromStateEngineOptimumResult {
    const found = results.find(
        (result): result is FundedFromStateEngineOptimumResult =>
            result.source === AdviceSource.FundedSweepFromState,
    );
    if (found === undefined) throw new Error('expected a from-state result');
    return found;
}

function payoutSizeResultWithWinner(
    results: readonly EngineOptimumRunnerResult[],
    requestSize: number,
): PayoutSizeSweepEngineOptimumResult {
    const found = results.find(
        (result): result is PayoutSizeSweepEngineOptimumResult =>
            result.source === AdviceSource.PayoutSizeSweep,
    );
    if (found?.sweep.kind !== PayoutSizeSweepResultKind.Optimum) {
        throw new Error('expected a payout-size optimum');
    }
    const { optimum } = found.sweep;
    return {
        source: AdviceSource.PayoutSizeSweep,
        sweep: {
            kind: PayoutSizeSweepResultKind.Optimum,
            optimum: {
                ...optimum,
                winner: { ...optimum.winner, requestSize },
            },
        },
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(TOPSTEP_ID);

function resultsOf(
    advisor: FundedSizingAdvisor,
): readonly EngineOptimumRunnerResult[] {
    return advisor
        .optimumRequests()
        .map((request) => runEngineOptimum(plan, request));
}

function sweepOnlyResults(
    results: readonly EngineOptimumRunnerResult[],
): readonly EngineOptimumRunnerResult[] {
    return results.filter(
        (result) => result.source !== AdviceSource.PayoutSizeSweep,
    );
}

function sweepResultsOf(
    advisor: FundedSizingAdvisor,
): readonly EngineOptimumRunnerResult[] {
    return sweepOnlyResults(resultsOf(advisor));
}

function tracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

describe('FundedSizingAdvisor.assemble PayoutPolicyDiffers against the headline request (PT-19g, F-128)', () => {
    it('does not flag the payout-size optimum when it equals the headline request raised to the plan minimum', () => {
        const advisor = advisorWith({ rulebook: LOW_REQUEST_RULEBOOK });
        const minimum = effectivePayoutRequest(plan, 100);
        expect(minimum).toBeGreaterThan(100);
        const results = resultsOf(advisor);
        const crafted = [
            ...sweepOnlyResults(results),
            payoutSizeResultWithWinner(results, minimum),
        ];

        const reasons = enginePolicyReasons(
            advisor.assemble(crafted).differenceReasons,
        );

        expect(reasons).toEqual([]);
    });

    it('flags the payout-size optimum when it differs from the headline request, naming both sizes', () => {
        const advisor = advisorWith();
        const results = resultsOf(advisor);
        const crafted = [
            ...sweepOnlyResults(results),
            payoutSizeResultWithWinner(results, 750),
        ];

        const reasons = enginePolicyReasons(
            advisor.assemble(crafted).differenceReasons,
        );

        expect(reasons).toHaveLength(1);
        expect(reasons[0]?.enginePolicyLabel).toContain('750');
        expect(reasons[0]?.headlinePolicyLabel).toContain('500');
    });

    it('compares the payout-size optimum with the personal override when one is set', () => {
        const advisor = advisorWith({ personalPayoutOverride: 750 });
        const results = resultsOf(advisor);
        const crafted = [payoutSizeResultWithWinner(results, 750)];

        const reasons = enginePolicyReasons(
            advisor.assemble(crafted).differenceReasons,
        );

        expect(reasons).toEqual([]);
    });

    it('runs the fresh and from-state sweeps at the personal override, so the headline and the sweeps share one effective request', () => {
        const advisor = advisorWith({ personalPayoutOverride: 1500 });
        const requests = advisor
            .optimumRequests()
            .filter(
                (request) =>
                    request.source === AdviceSource.FundedSweepFresh ||
                    request.source === AdviceSource.FundedSweepFromState,
            );
        expect(requests.map((request) => request.source)).toEqual([
            AdviceSource.FundedSweepFresh,
            AdviceSource.FundedSweepFromState,
        ]);

        for (const request of requests) {
            const inputs = applyEnginePolicy(plan, request.policy, {
                ...request.base,
                plan,
            });
            expect(inputs.payoutRequestSize).toBe(1500);
        }
        const reasons = enginePolicyReasons(
            advisor.assemble(sweepResultsOf(advisor)).differenceReasons,
        );
        expect(reasons).toEqual([]);
    });

    it('runs the sweeps at the rulebook effective request without a personal override', () => {
        const advisor = advisorWith();

        const request = advisor
            .optimumRequests()
            .find(
                (candidate) =>
                    candidate.source === AdviceSource.FundedSweepFresh,
            );

        if (request?.source !== AdviceSource.FundedSweepFresh) {
            throw new Error('expected a fresh sweep request');
        }
        expect(
            applyEnginePolicy(plan, request.policy, { ...request.base, plan })
                .payoutRequestSize,
        ).toBe(500);
    });

    it('does not flag the sweeps when the override and the rulebook request resolve to the same effective request', () => {
        const advisor = advisorWith({ personalPayoutOverride: 500 });

        const reasons = enginePolicyReasons(
            advisor.assemble(sweepResultsOf(advisor)).differenceReasons,
        );

        expect(reasons).toEqual([]);
    });

    it('does not flag the sweeps without a personal override', () => {
        const advisor = advisorWith();

        const reasons = enginePolicyReasons(
            advisor.assemble(sweepResultsOf(advisor)).differenceReasons,
        );

        expect(reasons).toEqual([]);
    });

    it('does not flag anything when no engine result is present', () => {
        const advisor = advisorWith({ personalPayoutOverride: 1500 });

        expect(
            enginePolicyReasons(advisor.assemble([]).differenceReasons),
        ).toEqual([]);
    });
});

describe('FundedSizingAdvisor.assemble reasons when the from-state sweep is the only sweep result (PT-19g, F-122)', () => {
    it('keeps the horizon credit disclosure and the from-state basis, with no fresh-start approximation', () => {
        const advisor = advisorWith();
        const fromState = fromStateResultOf(resultsOf(advisor));

        const advice = advisor.assemble([fromState]);

        expect(advice.provenance.startBasis).toBe(StartBasis.FromState);
        const kinds = advice.differenceReasons.map((reason) => reason.kind);
        expect(kinds).toContain(DifferenceReason.HorizonCreditOneRequest);
        expect(kinds).not.toContain(DifferenceReason.FreshStartApproximation);
    });

    it('names the candidates the from-state sweep left out', () => {
        const advisor = advisorWith();
        const fromState = fromStateResultOf(resultsOf(advisor));
        if (fromState.sweep.kind !== FundedFromStateOptimumResultKind.Optimum) {
            throw new Error('expected a from-state optimum');
        }
        const { optimum } = fromState.sweep;
        const withRefusal: FundedFromStateEngineOptimumResult = {
            source: AdviceSource.FundedSweepFromState,
            sweep: {
                kind: FundedFromStateOptimumResultKind.Optimum,
                optimum: {
                    ...optimum,
                    rows: [
                        ...optimum.rows,
                        {
                            kind: EngineOptimumRowKind.Refused,
                            label: 'flat $100',
                            reason: {
                                dollar: 100,
                                kind: EngineOptimumRefusalKind.FlatBelowOneContract,
                            },
                        },
                    ],
                },
            },
        };

        const advice = advisor.assemble([withRefusal]);

        expect(
            advice.differenceReasons.find(
                (reason) => reason.kind === DifferenceReason.CandidatesLeftOut,
            ),
        ).toEqual({
            kind: DifferenceReason.CandidatesLeftOut,
            leftOutCount: 1,
        });
    });

    it('says the engine inputs were refused when the only sweep result has no candidates', () => {
        const advisor = advisorWith();
        const refused: FundedFromStateEngineOptimumResult = {
            source: AdviceSource.FundedSweepFromState,
            sweep: {
                kind: FundedFromStateOptimumResultKind.NoCandidates,
                refusal: {
                    flatsBelowOneContract: [250],
                    kind: FundedCandidateRefusal.NoCandidates,
                },
            },
        };

        const advice = advisor.assemble([refused]);

        expect(
            advice.differenceReasons.some(
                (reason) =>
                    reason.kind === DifferenceReason.EngineInputsRefused,
            ),
        ).toBe(true);
    });
});

describe('FundedSizingAdvisor.assemble with an unusable personal payout override (PT-19g review)', () => {
    it.each([0, -50, NaN, Infinity, 500.555])(
        'does not throw for %s, says the override was ignored, and sizes at the rulebook request',
        (override) => {
            const advisor = advisorWith({ personalPayoutOverride: override });
            const results = sweepResultsOf(advisor);

            const advice = advisor.assemble(results);

            const refused = advice.differenceReasons.filter(
                (reason) =>
                    reason.kind === DifferenceReason.EngineInputsRefused,
            );
            expect(refused).toHaveLength(1);
            expect(JSON.stringify(refused[0])).toContain('personal payout');
            expect(enginePolicyReasons(advice.differenceReasons)).toEqual([]);
            const request = advisor
                .optimumRequests()
                .find(
                    (candidate) =>
                        candidate.source === AdviceSource.FundedSweepFresh,
                );
            if (request?.source !== AdviceSource.FundedSweepFresh) {
                throw new Error('expected a fresh sweep request');
            }
            expect(
                applyEnginePolicy(plan, request.policy, {
                    ...request.base,
                    plan,
                }).payoutRequestSize,
            ).toBe(500);
        },
    );

    it('does not throw for an unusable override when the account has no funded tracker', () => {
        const state = accountState();
        const advisor = new FundedSizingAdvisor({
            account: {
                ...account(),
                fundedTracker: null,
                state,
            },
            fundedHorizonDays: 252,
            personalPayoutOverride: dollars(-1),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });

        expect(() => advisor.assemble([])).not.toThrow();
    });

    it('stays silent about the override when none is set or it is usable', () => {
        for (const override of [undefined, 750]) {
            const advisor = advisorWith({ personalPayoutOverride: override });

            const kinds = advisor
                .assemble(sweepResultsOf(advisor))
                .differenceReasons.map((reason) => reason.kind);

            expect(kinds).not.toContain(DifferenceReason.EngineInputsRefused);
        }
    });
});

describe('FundedSizingAdvisor.assemble personal override payout warning (PT-19g review, F-128)', () => {
    const WARNING: PersonalPayoutOverrideWarning = {
        horizonDays: 252,
        optimumBustProbability: 0.1,
        optimumMonthlyNet: 900,
        optimumRequestSize: 1000,
        overrideBustProbability: 0.4,
        overrideMonthlyNet: 300,
        overrideRequestSize: 500,
        retainedCushion: 2000,
        retainedCushionBasis: RetainedCushionBasis.RulebookSize,
    };

    function withWarning(
        results: readonly EngineOptimumRunnerResult[],
        warning: null | PersonalPayoutOverrideWarning,
    ): readonly EngineOptimumRunnerResult[] {
        return results.map((result) => {
            if (
                result.source !== AdviceSource.PayoutSizeSweep ||
                result.sweep.kind !== PayoutSizeSweepResultKind.Optimum
            ) {
                return result;
            }
            const { optimum } = result.sweep;
            const row = optimum.personalOverride?.row ?? optimum.winner;
            return {
                source: AdviceSource.PayoutSizeSweep,
                sweep: {
                    kind: PayoutSizeSweepResultKind.Optimum,
                    optimum: {
                        ...optimum,
                        personalOverride: { row, warning },
                    },
                },
            };
        });
    }

    it('carries the non-monotonic payout warning on the payout advice', () => {
        const advisor = advisorWith({ personalPayoutOverride: 1500 });

        const advice = advisor.assemble(
            withWarning(resultsOf(advisor), WARNING),
        );

        expect(advice.payoutAdvice?.personalOverrideWarning).toEqual(WARNING);
    });

    it('carries no warning when the sweep raised none', () => {
        const advisor = advisorWith({ personalPayoutOverride: 1500 });

        const advice = advisor.assemble(withWarning(resultsOf(advisor), null));

        expect(advice.payoutAdvice).not.toBeNull();
        expect(advice.payoutAdvice?.personalOverrideWarning).toBeUndefined();
    });

    it('carries no warning without a payout-size sweep result', () => {
        const advisor = advisorWith({ personalPayoutOverride: 1500 });

        const advice = advisor.assemble(sweepResultsOf(advisor));

        expect(advice.payoutAdvice?.personalOverrideWarning).toBeUndefined();
    });
});
