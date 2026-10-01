import { describe, expect, it } from 'vitest';

import { payoutBlockReasonText as plannerPayoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    AdviceDisplayKind,
    adviceViewModel,
    leftOutOptimumRow,
    OptimumRowStatus,
    payoutBlockReasonText,
    STALE_ADVICE_MESSAGE,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
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
    AccountAction,
    AdviceSource,
    assertSizingInvariant,
    assertTradeInvariant,
    AssumptionBias,
    createDocumentedRule,
    type DayProgress,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    NextTradeKind,
    NO_PERSONAL_CAPS,
    payoutBlockReasonFromGate,
    payoutPendingBlockReason,
    type ReconstructedFundedOrEvalAccount,
    ruleContextAt,
    runEngineOptimum,
    SizingStage,
    type SizingTerms,
    wouldTriggerLiveBlockReason,
} from '~/lib/prop-calculator/advisor';
import { PayoutGate } from '~/lib/prop-calculator/core';

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(TOPSTEP_STANDARD_ID);

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

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const state = accountState({
        elapsedDays: 0,
        startingBalance: 50_000,
        threshold: 48_000,
        tradingDays: 0,
    });
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function evalAdvisor(): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: evalAccount(),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
    });
}

function fundedAccount(
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

function fundedAdvisor(trials = 20): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
        trials,
    });
}

function smallLadderResults(
    advisor: EvalSizingAdvisor,
): readonly ReturnType<typeof runEngineOptimum>[] {
    const [request] = advisor.optimumRequests();
    if (request?.source !== AdviceSource.LadderSearchFresh) {
        throw new Error('expected a LadderSearchFresh request');
    }
    const bounded = {
        ...request,
        grid: { lo: 100, max: 300, slots: 2, step: 100 },
        maxGridSize: 2000,
    };
    return [runEngineOptimum(plan, bounded)];
}

function tracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

describe('adviceViewModel (PT-34, F-125 to F-128)', () => {
    it('puts the documented headline first with the label and the snapshot date', () => {
        const advisor = fundedAdvisor();
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice);

        expect(view.kind).toBe(AdviceDisplayKind.Ready);
        expect(view.headline).toContain('your documented rule');
        expect(view.headline).toContain('2026-09-26');
    });

    it('shows a stale message and withholds amounts when advice is stale', () => {
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 252,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-01-01',
            today: '2026-09-26',
            trials: 20,
        });
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Stale) {
            throw new Error('expected stale advice');
        }
        expect(view.message).toBe(STALE_ADVICE_MESSAGE);
        expect(view.reasonTexts.length).toBeGreaterThan(0);
        expect(
            view.reasonTexts.some((text) => text.includes('review cadence')),
        ).toBe(true);
    });

    it('reports every optimum by source with a standard error, including the from-state sweep and the payout-size sweep', () => {
        const advisor = fundedAdvisor();
        const results = advisor
            .optimumRequests()
            .map((request) => runEngineOptimum(plan, request));

        const advice = advisor.assemble(results);
        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.optima.length).toBe(results.length);
        const fresh = view.optima.find(
            (row) => row.source === AdviceSource.FundedSweepFresh,
        );
        expect(fresh?.status).toBe(OptimumRowStatus.Ready);
        expect(fresh?.text).toContain('capped end-of-horizon request credit');
        expect(fresh?.value).not.toBeNull();
        const fromState = view.optima.find(
            (row) => row.source === AdviceSource.FundedSweepFromState,
        );
        expect(fromState?.status).toBe(OptimumRowStatus.Ready);
        const payoutSweep = view.optima.find(
            (row) => row.source === AdviceSource.PayoutSizeSweep,
        );
        expect(payoutSweep?.status).toBe(OptimumRowStatus.Ready);
        expect(payoutSweep?.value).not.toBeNull();
    });

    it('shows a left-out row when a funded sweep has no candidates', () => {
        const advisor = fundedAdvisor();
        const [request] = advisor.optimumRequests();
        if (request?.source !== AdviceSource.FundedSweepFresh) {
            throw new Error('expected a FundedSweepFresh request');
        }
        const noCandidatesRequest = {
            ...request,
            candidates: { ...request.candidates, flat: [], fundedLadder: null },
        };
        const result = runEngineOptimum(plan, noCandidatesRequest);
        const advice = advisor.assemble([result]);

        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        const row = view.optima[0];
        expect(row?.status).toBe(OptimumRowStatus.LeftOut);
        expect(row?.text.startsWith('Left out: ')).toBe(true);
    });

    it('gives every requestable engine source a non-empty left-out label and text (review finding: worker-level failures)', () => {
        const advisor = fundedAdvisor();
        for (const request of advisor.optimumRequests()) {
            const row = leftOutOptimumRow(
                request.source,
                'the advisor worker threw before it could compute this',
            );
            expect(row.status).toBe(OptimumRowStatus.LeftOut);
            expect(row.label.length).toBeGreaterThan(0);
            expect(row.text).toBe(
                'Left out: the advisor worker threw before it could compute this',
            );
        }
    });

    it('renders a non-empty reason line for every DifferenceReason produced by a real advisor', () => {
        const advisor = fundedAdvisor();
        const results = advisor
            .optimumRequests()
            .map((request) => runEngineOptimum(plan, request));
        const advice = advisor.assemble(results);

        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.reasons.length).toBeGreaterThan(0);
        expect(
            view.reasons.some(
                (reason) =>
                    reason.kind === DifferenceReason.HorizonCreditOneRequest,
            ),
        ).toBe(true);
        for (const reason of view.reasons) {
            expect(reason.text.length).toBeGreaterThan(0);
        }
    });

    it('renders a non-empty text for every assumption, including live-triggers-not-checked', () => {
        const advisor = fundedAdvisor();
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.assumptions.length).toBeGreaterThan(0);
        for (const assumption of view.assumptions) {
            expect(assumption.text.length).toBeGreaterThan(0);
        }
        expect(
            view.assumptions.some((assumption) =>
                assumption.text.toLowerCase().includes('live'),
            ),
        ).toBe(true);
    });

    it('gives non-empty text for every PayoutGate and every PayoutBlockReasonKind (exhaustive)', () => {
        for (const gate of Object.values(PayoutGate)) {
            const text = payoutBlockReasonText(payoutBlockReasonFromGate(gate));
            expect(text.length).toBeGreaterThan(0);
        }
        expect(payoutBlockReasonText(payoutPendingBlockReason()).length).toBeGreaterThan(0);
        expect(
            payoutBlockReasonText(
                wouldTriggerLiveBlockReason({
                    paidPayoutsSinceLastLiveAccount: 2,
                    triggerAtPayoutCount: 3,
                }),
            ).length,
        ).toBeGreaterThan(0);
    });

    it('shares one PayoutGate and PayoutBlockReason text mapping with the payout planner (PT-34b)', () => {
        expect(payoutBlockReasonText).toBe(plannerPayoutBlockReasonText);
    });

    it("shows the daily plan card's rungs and stop reason as text, and every rung and step passes the sizing invariant", () => {
        const advisor = fundedAdvisor();
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard).not.toBeNull();
        if (view.dailyPlanCard === null) return;
        expect(view.dailyPlanCard.rungs.length).toBeGreaterThan(0);
        expect(view.dailyPlanCard.stopReasonText.length).toBeGreaterThan(0);

        const documented = advisor.documented();
        if (documented === null) throw new Error('expected documented sizing');
        const context = ruleContextAt(plan, SizingStage.Funded, fundedAccount().state, {
            ceiling: null,
            instrument: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
        });
        assertSizingInvariant(documented, context);

        const rule = createDocumentedRule(SizingStage.Funded, DEFAULT_RULEBOOK);
        const terms: SizingTerms = documented;
        let day: DayProgress = {
            dayPnL: dollars(0),
            losses: 0,
            runningLoss: dollars(0),
            wins: 0,
        };
        let trade = rule.nextTrade(context, day);
        let steps = 0;
        while (trade.kind === NextTradeKind.Trade) {
            assertTradeInvariant(trade, terms, context, day);
            day = {
                dayPnL: dollars(0 - trade.rung.runningLossAfter),
                losses: day.losses + 1,
                runningLoss: dollars(trade.rung.runningLossAfter),
                wins: day.wins,
            };
            trade = rule.nextTrade(context, day);
            steps += 1;
        }
        expect(steps).toBe(view.dailyPlanCard.rungs.length);
    });

    it('never mentions Kelly in the funded or eval advice view model', () => {
        const fundedResults = fundedAdvisor()
            .optimumRequests()
            .map((request) => runEngineOptimum(plan, request));
        const fundedView = adviceViewModel(fundedAdvisor().assemble(fundedResults));

        const evalResults = smallLadderResults(evalAdvisor());
        const evalView = adviceViewModel(evalAdvisor().assemble(evalResults));

        expect(JSON.stringify(fundedView).toLowerCase()).not.toContain('kelly');
        expect(JSON.stringify(evalView).toLowerCase()).not.toContain('kelly');
    });

    it('reports the ladder search optimum by source for an eval account', () => {
        const advisor = evalAdvisor();
        const results = smallLadderResults(advisor);

        const view = adviceViewModel(advisor.assemble(results));

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        const ladderRow = view.optima.find(
            (row) => row.source === AdviceSource.LadderSearchFresh,
        );
        expect(ladderRow?.status).toBe(OptimumRowStatus.Ready);
        expect(ladderRow?.text).toContain('Pass rate');
    });

    it('describes the payout advice with an assumption bias of optimistic for live triggers', () => {
        const advisor = fundedAdvisor();
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.payoutAdvice).not.toBeNull();
        expect(view.payoutAdvice?.documentedText.length).toBeGreaterThan(0);
        expect(
            view.assumptions.some(
                (assumption) => assumption.bias === AssumptionBias.Optimistic,
            ),
        ).toBe(true);
    });
});

describe('adviceViewModel next action and daily card values (PT-67)', () => {
    it('carries the next action: Trade for a fresh funded account that can place a trade', () => {
        const view = adviceViewModel(fundedAdvisor().assemble([]));

        expect(view.action).toBe(AccountAction.Trade);
    });

    it('carries EnterSnapshot, not an amount, for stale advice', () => {
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 252,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-01-01',
            today: '2026-09-26',
            trials: 20,
        });

        const view = adviceViewModel(advisor.assemble([]));

        expect(view.kind).toBe(AdviceDisplayKind.Stale);
        expect(view.action).toBe(AccountAction.EnterSnapshot);
    });

    it('carries StopForToday when the daily card has no rung', () => {
        const advice = fundedAdvisor().assemble([]);
        const stopped = {
            ...advice,
            dailyPlanCard:
                advice.dailyPlanCard === null
                    ? null
                    : { ...advice.dailyPlanCard, rungs: [] },
        };

        expect(adviceViewModel(stopped).action).toBe(AccountAction.StopForToday);
    });

    it('leaves the daily card values null until the value run fills them', () => {
        const view = adviceViewModel(fundedAdvisor().assemble([]));

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard?.valueNow).toBeNull();
        expect(view.dailyPlanCard?.valueAfterWin).toBeNull();
        expect(view.dailyPlanCard?.valueAfterLoss).toBeNull();
    });

    it('shows the daily card values the value run filled in', () => {
        const advice = fundedAdvisor().assemble([]);
        const filled = {
            ...advice,
            dailyPlanCard:
                advice.dailyPlanCard === null
                    ? null
                    : {
                          ...advice.dailyPlanCard,
                          valueAfterLoss: 700,
                          valueAfterWin: 1400,
                          valueNow: 1000,
                      },
        };

        const view = adviceViewModel(filled);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard?.valueNow).toBe(1000);
        expect(view.dailyPlanCard?.valueAfterWin).toBe(1400);
        expect(view.dailyPlanCard?.valueAfterLoss).toBe(700);
    });
});
