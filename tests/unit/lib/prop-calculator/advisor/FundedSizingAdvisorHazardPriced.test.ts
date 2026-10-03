import { beforeAll, describe, expect, it } from 'vitest';

import {
    type AccountState,
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    fraction,
    type FundedCycleTracker,
    type LiveTransitionTrigger,
    newFundedCycleTracker,
    PayoutCountTotalTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type Advice,
    AdviceSource,
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    DEFAULT_RULEBOOK,
    type EngineOptimumRequest,
    type EngineOptimumRunnerResult,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import { toSimInputs } from '~/lib/prop-calculator/advisor/policy';
import {
    LiveTransferContinuationKind,
    liveTransferContinuationNotes,
} from '~/lib/prop-calculator/simulator';

const HAZARD = 0.3;

const VERIFIED_LIMIT = 100_000;

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const UNCONFIRMED_SOURCE = {
    verification: PolicyVerification.NeedsPaste,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const PLAN = registryPlan();

const CONFIRMED_CUMULATIVE = new CumulativeAmountTrigger(
    dollars(VERIFIED_LIMIT),
    CONFIRMED_SOURCE,
);

const CONFIRMED_ONLY_POLICY = new StubTriggerPolicy([CONFIRMED_CUMULATIVE]);

const UNCONFIRMED_ONLY_POLICY = new StubTriggerPolicy([
    new CumulativeAmountTrigger(dollars(VERIFIED_LIMIT), UNCONFIRMED_SOURCE),
]);

const CONFIRMED_BESIDE_TOTAL_POLICY = new StubTriggerPolicy([
    CONFIRMED_CUMULATIVE,
    new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
]);

const HAZARD_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    liveTransfer: { hazardPerPaidPayoutByFirm: { [FirmId.TopStep]: HAZARD } },
};

function accountOf(tradingDays: number): ReconstructedFundedOrEvalAccount {
    const state = stateOf(tradingDays);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: trackerOf(state),
        kind: TradingPhase.Funded,
        plan: PLAN,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function advisorOf(
    rulebook: RulebookParameters,
    accountPolicy?: FirmAccountPolicy,
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: accountOf(20),
        ...(accountPolicy !== undefined && { accountPolicy }),
        fundedHorizonDays: 60,
        rulebook,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function isNotChecked(advice: Advice): boolean {
    return advice.assumptions.some(
        (assumption) =>
            assumption.kind === AssumptionKind.LiveTriggersNotChecked,
    );
}

function pricedTriggersOf(advice: Advice) {
    return advice.assumptions.filter(
        (assumption) =>
            assumption.kind === AssumptionKind.CumulativePayoutTriggerPriced,
    );
}

function registryPlan(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K plan missing');
    return found;
}

function sizeSpecOf(policy: FirmAccountPolicy) {
    const sizeRequest = advisorOf(DEFAULT_RULEBOOK, policy)
        .optimumRequests()
        .find((request) => request.source === AdviceSource.PayoutSizeSweep);
    if (sizeRequest?.source !== AdviceSource.PayoutSizeSweep) {
        throw new Error('the advisor made no payout-size request');
    }
    return sizeRequest.spec;
}

function stateOf(tradingDays: number): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: tradingDays,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays,
    };
}

function sweepBasesOf(
    requests: readonly EngineOptimumRequest[],
): readonly { readonly base: object; readonly source: AdviceSource }[] {
    return requests.flatMap((request) =>
        request.source === AdviceSource.FundedSweepFresh ||
        request.source === AdviceSource.FundedSweepFromState
            ? [{ base: request.base, source: request.source }]
            : [],
    );
}

function sweepResultsOf(
    advisor: FundedSizingAdvisor,
): readonly EngineOptimumRunnerResult[] {
    return advisor
        .optimumRequests()
        .filter(
            (request) =>
                request.source === AdviceSource.FundedSweepFresh ||
                request.source === AdviceSource.FundedSweepFromState,
        )
        .map((request) => runEngineOptimum(PLAN, request));
}

function trackerOf(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

function withRegistryPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = findFirm(FirmId.TopStep) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('the funded advisor prices the rulebook live-transfer hazard in its sweeps (PT-36m, F-145)', () => {
    it('puts the firm hazard into the fresh and the from-state sweep bases', () => {
        const bases = sweepBasesOf(
            advisorOf(HAZARD_RULEBOOK).optimumRequests(),
        );
        expect(bases.map((entry) => entry.source)).toEqual([
            AdviceSource.FundedSweepFresh,
            AdviceSource.FundedSweepFromState,
        ]);
        for (const { base } of bases) {
            expect(base).toMatchObject({
                liveTransferHazard: fraction(HAZARD),
            });
        }
    });

    it('leaves the hazard out of the bases when the rulebook holds none for the firm', () => {
        const bases = sweepBasesOf(
            advisorOf(DEFAULT_RULEBOOK).optimumRequests(),
        );
        expect(bases).toHaveLength(2);
        for (const { base } of bases) {
            expect(base).not.toHaveProperty('liveTransferHazard');
        }
    });

    describe('through the real advisor path', () => {
        const advisor = advisorOf(HAZARD_RULEBOOK);
        let advice: Advice;

        beforeAll(() => {
            const results: readonly EngineOptimumRunnerResult[] = advisor
                .optimumRequests()
                .filter(
                    (request) =>
                        request.source === AdviceSource.FundedSweepFresh ||
                        request.source === AdviceSource.FundedSweepFromState,
                )
                .map((request) => runEngineOptimum(PLAN, request));
            advice = advisor.assemble(results);
        });

        it('lists the priced hazard as an assumption of the figures', () => {
            expect(
                advice.assumptions.some(
                    (assumption) =>
                        assumption.kind === AssumptionKind.LiveTransferHazard,
                ),
            ).toBe(true);
        });

        it('no longer says the hazard is not priced, since every sweep it runs prices it', () => {
            expect(
                advice.assumptions.some(
                    (assumption) =>
                        assumption.kind ===
                        AssumptionKind.LiveTransferHazardNotPriced,
                ),
            ).toBe(false);
        });
    });
});

describe('the funded advisor prices the verified cumulative live trigger in its sweeps (PT-36m, F-145)', () => {
    it('puts a confirmed cumulative trigger into the sweep bases', () => {
        const policy = new StubTriggerPolicy([
            new CumulativeAmountTrigger(
                dollars(VERIFIED_LIMIT),
                CONFIRMED_SOURCE,
            ),
        ]);
        const bases = sweepBasesOf(
            advisorOf(DEFAULT_RULEBOOK, policy).optimumRequests(),
        );
        expect(bases).toHaveLength(2);
        for (const { base } of bases) {
            expect(base).toMatchObject({
                verifiedCumulativePayoutTrigger: VERIFIED_LIMIT,
            });
        }
    });

    it('ignores a cumulative trigger the firm source does not confirm', () => {
        const policy = new StubTriggerPolicy([
            new CumulativeAmountTrigger(
                dollars(VERIFIED_LIMIT),
                UNCONFIRMED_SOURCE,
            ),
        ]);
        for (const { base } of sweepBasesOf(
            advisorOf(DEFAULT_RULEBOOK, policy).optimumRequests(),
        )) {
            expect(base).not.toHaveProperty('verifiedCumulativePayoutTrigger');
        }
    });

    it('adds nothing when the advisor has no account policy', () => {
        for (const { base } of sweepBasesOf(
            advisorOf(DEFAULT_RULEBOOK).optimumRequests(),
        )) {
            expect(base).not.toHaveProperty('verifiedCumulativePayoutTrigger');
        }
    });

    describe('the payout-size optimum prices the same confirmed trigger (PT-36p, F-145)', () => {
        it('builds the payout-size inputs with the confirmed cumulative trigger, like the other sweeps', () => {
            const inputs = withRegistryPolicy(CONFIRMED_ONLY_POLICY, () =>
                toSimInputs(PLAN, sizeSpecOf(CONFIRMED_ONLY_POLICY)),
            );
            expect(inputs.verifiedCumulativePayoutTrigger).toBe(VERIFIED_LIMIT);
        });
    });

    describe('the not-checked line for a confirmed cumulative trigger (PT-36p, F-145)', () => {
        it('stays while no sweep produced an optimum, because no figure prices the trigger yet', () => {
            const advisor = advisorOf(DEFAULT_RULEBOOK, CONFIRMED_ONLY_POLICY);
            expect(isNotChecked(advisor.assemble([]))).toBe(true);
        });

        it('goes once a sweep produced an optimum that prices the only trigger, the confirmed cumulative one', () => {
            const advisor = advisorOf(DEFAULT_RULEBOOK, CONFIRMED_ONLY_POLICY);
            const advice = advisor.assemble(sweepResultsOf(advisor));
            expect(isNotChecked(advice)).toBe(false);
        });

        it('stays beside a trigger no sweep prices even after the sweeps ran', () => {
            const advisor = advisorOf(
                DEFAULT_RULEBOOK,
                CONFIRMED_BESIDE_TOTAL_POLICY,
            );
            const advice = advisor.assemble(sweepResultsOf(advisor));
            expect(isNotChecked(advice)).toBe(true);
        });

        it('stays when the cumulative trigger is not confirmed, because no sweep prices it', () => {
            const advisor = advisorOf(
                DEFAULT_RULEBOOK,
                UNCONFIRMED_ONLY_POLICY,
            );
            expect(isNotChecked(advisor.assemble([]))).toBe(true);
        });

        it('stays when a trigger no sweep prices sits beside the priced one', () => {
            const advisor = advisorOf(
                DEFAULT_RULEBOOK,
                CONFIRMED_BESIDE_TOTAL_POLICY,
            );
            expect(isNotChecked(advisor.assemble([]))).toBe(true);
        });

        it('is said for the same plan with no trigger policy', () => {
            const advisor = advisorOf(DEFAULT_RULEBOOK);
            expect(isNotChecked(advisor.assemble([]))).toBe(true);
        });
    });

    describe('the priced cumulative trigger is a typed assumption of the sweep figures (PT-36p, F-145)', () => {
        let advice: Advice;

        beforeAll(() => {
            const advisor = advisorOf(DEFAULT_RULEBOOK, CONFIRMED_ONLY_POLICY);
            advice = advisor.assemble(sweepResultsOf(advisor));
        });

        it('carries the amount and the firm source, with no hazard entered', () => {
            expect(pricedTriggersOf(advice)).toEqual([
                {
                    amount: VERIFIED_LIMIT,
                    bias: AssumptionBias.Neutral,
                    continuation: LiveTransferContinuationKind.NotModeled,
                    kind: AssumptionKind.CumulativePayoutTriggerPriced,
                    notes: liveTransferContinuationNotes(
                        PLAN,
                        LiveTransferContinuationKind.NotModeled,
                    ),
                    source: {
                        fetchedOn: CONFIRMED_SOURCE.fetchedOn,
                        quote: CONFIRMED_SOURCE.quote,
                        url: CONFIRMED_SOURCE.url,
                    },
                },
            ]);
            expect(
                advice.assumptions.some(
                    (assumption) =>
                        assumption.kind === AssumptionKind.LiveTransferHazard,
                ),
            ).toBe(false);
        });

        it('says the documented payout decision does not check the request against it, and the decision itself still says live triggers are not checked', () => {
            expect(
                pricedTriggersOf(advice).map((assumption) =>
                    assumptionText(assumption),
                ),
            ).toEqual([
                expect.stringContaining(
                    'The documented payout request is not checked against this trigger.',
                ),
            ]);
            expect(advice.payoutAdvice?.assumptions).toContainEqual(
                expect.objectContaining({
                    kind: AssumptionKind.LiveTriggersNotChecked,
                }),
            );
        });

        it('is not claimed before any sweep ran', () => {
            const advisor = advisorOf(DEFAULT_RULEBOOK, CONFIRMED_ONLY_POLICY);
            expect(pricedTriggersOf(advisor.assemble([]))).toEqual([]);
        });

        it('is not claimed for a trigger the firm source does not confirm', () => {
            const advisor = advisorOf(
                DEFAULT_RULEBOOK,
                UNCONFIRMED_ONLY_POLICY,
            );
            const unconfirmed = advisor.assemble(sweepResultsOf(advisor));
            expect(pricedTriggersOf(unconfirmed)).toEqual([]);
        });
    });
});
