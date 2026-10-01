import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
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
    AdviceStalenessReason,
    AssumptionKind,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    FundedSizingAdvisor,
    NextTradeRiskVerdict,
    PayoutSizeSweepResultKind,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
    SizingConstraint,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

const ZERO_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const TOPSTEP_STANDARD_CONSISTENCY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardConsistency,
};

function account(
    overrides: Partial<ReconstructedFundedOrEvalAccount> = {},
): ReconstructedFundedOrEvalAccount {
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
        ...overrides,
    };
}

function accountState(overrides: Partial<AccountState> = {}): AccountState {
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
        ...overrides,
    };
}

function advisorAt(
    reconstructed: ReconstructedFundedOrEvalAccount,
    trials?: number,
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: reconstructed,
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
        trials,
    });
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(TOPSTEP_STANDARD_ID);

function tracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

describe('FundedSizingAdvisor (PT-19f, F-118, F-121)', () => {
    it('documents the flat funded risk with a cumulative daily-loss cap from the real plan', () => {
        const advisor = advisorAt(account());

        const documented = advisor.documented();

        expect(documented?.rungs[0]?.risk).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / 100,
        );
    });

    it('caps() reports the affordable room and the contract limit', () => {
        const advisor = advisorAt(account());

        const caps = advisor.caps();

        expect(caps.affordable).toBeGreaterThan(0);
        expect(caps.maxTradesPerDay).toBeNull();
    });

    it('requests a FundedSweepFresh sweep carrying the built engine policy and CLI-ordered flat candidates', () => {
        const advisor = advisorAt(account());

        const [request] = advisor.optimumRequests();

        expect(request?.source).toBe(AdviceSource.FundedSweepFresh);
        if (request?.source !== AdviceSource.FundedSweepFresh) return;
        expect(request.policy.fundedHorizonDays).toBe(252);
        expect(request.candidates.flat).toBeDefined();
    });

    it('assemble() discloses HorizonCreditOneRequest and that live triggers are not yet checked (F-145)', () => {
        const advisor = advisorAt(account());
        const [request] = advisor.optimumRequests();
        if (request === undefined) throw new Error('expected a request');
        const result = runEngineOptimum(plan, request);

        const advice = advisor.assemble([result]);

        expect(
            advice.differenceReasons.some(
                (reason) =>
                    reason.kind === DifferenceReason.HorizonCreditOneRequest,
            ),
        ).toBe(true);
        expect(
            advice.assumptions.some(
                (assumption) =>
                    assumption.kind === AssumptionKind.LiveTriggersNotChecked,
            ),
        ).toBe(true);
        expect(advice.payoutAdvice).not.toBeNull();
    });

    it('assemble() carries the real firm-data verification date and any given plan-rules fingerprint (F-126)', () => {
        const advisor = advisorAt(account());

        const advice = advisor.assemble([]);

        expect(advice.provenance.firmDataDate).toBe(
            firmDataProvenance(FirmId.TopStep).verifiedOn,
        );
        expect(advice.provenance.planRulesFingerprint).toBeNull();

        const withFingerprint = new FundedSizingAdvisor({
            account: account(),
            fundedHorizonDays: 252,
            planRulesFingerprint: { atAdvice: 'old-hash', current: 'new-hash' },
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            today: '2026-09-26',
        }).assemble([]);

        expect(withFingerprint.provenance.planRulesFingerprint).toBe(
            'new-hash',
        );
    });

    it('staleness() marks PlanRulesChanged when the given fingerprint mismatches (F-141, F-98)', () => {
        const advisor = new FundedSizingAdvisor({
            account: account(),
            fundedHorizonDays: 252,
            planRulesFingerprint: { atAdvice: 'old-hash', current: 'new-hash' },
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            today: '2026-09-26',
        });

        const staleness = advisor.staleness();

        expect(staleness.kind).toBe('stale');
        if (staleness.kind !== 'stale') return;
        expect(staleness.reasons).toContain(
            AdviceStalenessReason.PlanRulesChanged,
        );
    });
});

describe('FundedSizingAdvisor: funded-consistency ceiling (PT-19f, F-146, F-154)', () => {
    const consistencyPlan = registryPlan(TOPSTEP_STANDARD_CONSISTENCY_ID);

    function consistencyAccount(): ReconstructedFundedOrEvalAccount {
        const state = accountState({ balance: 50_600, startingBalance: 50_000 });
        return {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: tracker(state),
            kind: TradingPhase.Funded,
            plan: consistencyPlan,
            resolvedDailyLossLimit: null,
            state,
        };
    }

    it('sources the ceiling from the plan\'s own fundedConsistencyRule against the real cycle profit, capping the daily plan card', () => {
        const advisor = new FundedSizingAdvisor({
            account: consistencyAccount(),
            fundedHorizonDays: 252,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            today: '2026-09-26',
        });
        const expectedCeiling = consistencyPlan
            .fundedConsistencyRule(0)
            ?.maxDayProfitBeforeViolation(600);
        expect(expectedCeiling).toBe(400);

        const card = advisor.dailyPlanCard();

        expect(card?.rungs[0]?.risk).toBe(200);
        expect(card?.rungs[0]?.takeProfit).toBe(400);
        expect(card?.rungs[0]?.cappedBy).toContain(
            SizingConstraint.CeilingCap,
        );
    });
});

describe('FundedSizingAdvisor: PT-32 from-state sweep, payout-size sweep', () => {
    it('adds FundedSweepFromState and PayoutSizeSweep once the account has elapsed history (tradingDays > 0)', () => {
        const advisor = advisorAt(account());

        const requests = advisor.optimumRequests();

        expect(requests.map((request) => request.source)).toStrictEqual([
            AdviceSource.FundedSweepFresh,
            AdviceSource.FundedSweepFromState,
            AdviceSource.PayoutSizeSweep,
        ]);
        const [, fromStateRequest, payoutSizeRequest] = requests;
        if (fromStateRequest?.source !== AdviceSource.FundedSweepFromState) {
            throw new Error('expected a from-state request');
        }
        expect(fromStateRequest.start.phase).toBe(TradingPhase.Funded);
        expect(fromStateRequest.start.state).toStrictEqual(account().state);
        if (payoutSizeRequest?.source !== AdviceSource.PayoutSizeSweep) {
            throw new Error('expected a payout-size sweep request');
        }
        expect(payoutSizeRequest.spec.start).toBeDefined();
    });

    it('omits FundedSweepFromState and runs PayoutSizeSweep fresh for a brand-new funded account (0 elapsed history)', () => {
        const freshState = accountState({ tradingDays: 0 });
        const advisor = advisorAt(
            account({
                cushion: freshState.balance - freshState.threshold,
                fundedTracker: tracker(freshState),
                state: freshState,
            }),
        );

        const requests = advisor.optimumRequests();

        expect(requests.map((request) => request.source)).toStrictEqual([
            AdviceSource.FundedSweepFresh,
            AdviceSource.PayoutSizeSweep,
        ]);
        const [, payoutSizeRequest] = requests;
        if (payoutSizeRequest?.source !== AdviceSource.PayoutSizeSweep) {
            throw new Error('expected a payout-size sweep request');
        }
        expect(payoutSizeRequest.spec.start).toBeUndefined();
    });

    it('assemble() marks the start basis FromState and omits FreshStartApproximation once a from-state optimum is present', () => {
        const advisor = advisorAt(account(), 20);
        const requests = advisor.optimumRequests();
        const results = requests.map((request) => runEngineOptimum(plan, request));

        const advice = advisor.assemble(results);

        expect(advice.provenance.startBasis).toBe(StartBasis.FromState);
        expect(advice.provenance.source).toBe(AdviceSource.FundedSweepFromState);
        expect(
            advice.differenceReasons.some(
                (reason) => reason.kind === DifferenceReason.FreshStartApproximation,
            ),
        ).toBe(false);
        expect(
            advice.differenceReasons.some(
                (reason) => reason.kind === DifferenceReason.HorizonCreditOneRequest,
            ),
        ).toBe(true);
    });

    it('assemble() keeps StartBasis.Fresh and FreshStartApproximation without a from-state result', () => {
        const advisor = advisorAt(account());
        const [freshRequest] = advisor.optimumRequests();
        if (freshRequest === undefined) throw new Error('expected a request');
        const result = runEngineOptimum(plan, freshRequest);

        const advice = advisor.assemble([result]);

        expect(advice.provenance.startBasis).toBe(StartBasis.Fresh);
        expect(advice.provenance.source).toBe(AdviceSource.FundedSweepFresh);
        expect(
            advice.differenceReasons.some(
                (reason) => reason.kind === DifferenceReason.FreshStartApproximation,
            ),
        ).toBe(true);
    });

    it('assemble() attaches PayoutPolicyDiffers exactly when the payout-size optimum picks a different request than the rulebook default', () => {
        const advisor = advisorAt(account(), 20);
        const requests = advisor.optimumRequests();
        const results = requests.map((request) => runEngineOptimum(plan, request));
        const payoutSizeResult = results.find(
            (result) => result.source === AdviceSource.PayoutSizeSweep,
        );
        if (
            payoutSizeResult === undefined ||
            !('sweep' in payoutSizeResult) ||
            payoutSizeResult.sweep.kind !== PayoutSizeSweepResultKind.Optimum
        ) {
            throw new Error('expected a payout-size optimum');
        }
        const documentedRequest = DEFAULT_RULEBOOK.payout.requestCents / 100;
        const isWinnerDiffers =
            payoutSizeResult.sweep.optimum.winner.requestSize !== documentedRequest;

        const advice = advisor.assemble(results);

        expect(
            advice.differenceReasons.some(
                (reason) => reason.kind === DifferenceReason.PayoutPolicyDiffers,
            ),
        ).toBe(isWinnerDiffers);
    });
});

describe('FundedSizingAdvisor.checkNextTradeRisk (PT-24b)', () => {
    it('checks the same rung the daily plan card starts with', () => {
        const advisor = advisorAt(account());
        const documentedRung = DEFAULT_RULEBOOK.funded.riskCents / 100;

        const result = advisor.checkNextTradeRisk(
            dollars(documentedRung),
            ZERO_DAY,
        );

        expect(result).not.toBeNull();
        expect(result?.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result?.documentedRung).toBe(
            advisor.dailyPlanCard()?.rungs[0]?.risk,
        );
    });

    it('is AboveDocumented with the excess in cents above the documented rung', () => {
        const advisor = advisorAt(account());
        const documentedRung = DEFAULT_RULEBOOK.funded.riskCents / 100;

        const result = advisor.checkNextTradeRisk(
            dollars(documentedRung + 50),
            ZERO_DAY,
        );

        expect(result?.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(result?.excessCents).toBe(5000);
    });

    it('flags payoutEligibleAboveRung when the account is payout-eligible', () => {
        const seedState = accountState({
            qualifyingDays: 0,
            startingBalance: 50_000,
        });
        const fundedTracker = tracker(seedState);
        const state = accountState({
            balance: 60_000,
            qualifyingDays: 9999,
            startingBalance: 50_000,
            tradingDays: 9999,
        });
        const advisor = new FundedSizingAdvisor({
            account: {
                assumptions: [],
                contractLimit: null,
                cushion: state.balance - state.threshold,
                fundedTracker,
                kind: TradingPhase.Funded,
                plan,
                resolvedDailyLossLimit: null,
                state,
            },
            fundedHorizonDays: 252,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            today: '2026-09-26',
        });
        const documentedRung = DEFAULT_RULEBOOK.funded.riskCents / 100;

        const result = advisor.checkNextTradeRisk(
            dollars(documentedRung + 50),
            ZERO_DAY,
        );

        expect(result?.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(result?.payoutEligibleAboveRung).toBe(true);
    });

    it('is null while advice is stale', () => {
        const advisor = new FundedSizingAdvisor({
            account: account(),
            fundedHorizonDays: 252,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-01-01',
            today: '2026-09-26',
        });

        expect(advisor.checkNextTradeRisk(dollars(250), ZERO_DAY)).toBeNull();
    });

    it('never reports WithinPlan or AboveDp for a proposed risk once the day is already stopped (review CRITICAL)', () => {
        const advisor = advisorAt(account());
        const rungs = advisor.dailyPlanCard()?.rungs ?? [];
        if (rungs.length === 0) {
            throw new Error('expected at least one rung in this fixture');
        }
        const lastRung = rungs.at(-1);
        if (lastRung === undefined) throw new Error('expected a last rung');
        const runningLossAfter: number = lastRung.runningLossAfter;
        const stoppedDay = {
            dayPnL: dollars(-runningLossAfter),
            losses: rungs.length,
            runningLoss: lastRung.runningLossAfter,
            wins: 0,
        };

        const result = advisor.checkNextTradeRisk(dollars(10_000), stoppedDay);

        expect(result).not.toBeNull();
        expect(result?.verdict).not.toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result?.verdict).not.toBe(NextTradeRiskVerdict.AboveDp);
        expect(result?.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(result?.excessCents).toBe(1_000_000);
    });
});
