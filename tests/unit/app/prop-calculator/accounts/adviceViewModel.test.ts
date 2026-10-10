import { describe, expect, it } from 'vitest';

import { payoutBlockReasonText as plannerPayoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    AdviceDisplayKind,
    adviceViewModel,
    leftOutOptimumRow,
    OptimumRowStatus,
    payoutBlockReasonText,
    type PersonalLimits,
    STALE_ADVICE_MESSAGE,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    type AccountState,
    type Dollars,
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
    DocumentedPolicyDisclosure,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    LiveTriggerScope,
    NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT,
    type NextPayoutProjection,
    NextTradeKind,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    payoutBlockReasonFromGate,
    payoutPendingBlockReason,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
    ruleContextAt,
    runEngineOptimum,
    SizingStage,
    type SizingTerms,
    wouldTriggerLiveBlockReason,
} from '~/lib/prop-calculator/advisor';
import { PayoutGate } from '~/lib/prop-calculator/core';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

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
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function evalAdvisor(): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: evalAccount(),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        substate: null,
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
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAdvisor(): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        fundedHorizonDays: 90,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

const FUNDED_RESULTS_KEY = 'funded';
const HEAVY_TEST_TIMEOUT_MS = 10_000;

const fundedOptimumResultsMemo = new Map<
    string,
    ReturnType<typeof computeFundedOptimumResults>
>();

function computeFundedOptimumResults() {
    const advisor = fundedAdvisor();
    return {
        advisor,
        results: advisor
            .optimumRequests()
            .map((request) => runEngineOptimum(plan, request)),
    };
}

function fundedOptimumResults() {
    const cached = fundedOptimumResultsMemo.get(FUNDED_RESULTS_KEY);
    if (cached !== undefined) return cached;
    const computed = computeFundedOptimumResults();
    fundedOptimumResultsMemo.set(FUNDED_RESULTS_KEY, computed);
    return computed;
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

        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

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
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

        if (view.kind !== AdviceDisplayKind.Stale) {
            throw new Error('expected stale advice');
        }
        expect(view.message).toBe(STALE_ADVICE_MESSAGE);
        expect(view.reasonTexts.length).toBeGreaterThan(0);
        expect(
            view.reasonTexts.some((text) => text.includes('review cadence')),
        ).toBe(true);
    });

    it(
        'reports every optimum by source with a standard error, including the from-state sweep and the payout-size sweep',
        () => {
            const { advisor, results } = fundedOptimumResults();

            const advice = advisor.assemble(results);
            const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

            if (view.kind !== AdviceDisplayKind.Ready) {
                throw new Error('expected ready advice');
            }
            expect(view.optima.length).toBe(results.length);
            const fresh = view.optima.find(
                (row) => row.source === AdviceSource.FundedSweepFresh,
            );
            expect(fresh?.status).toBe(OptimumRowStatus.Ready);
            expect(fresh?.text).toContain(
                'capped end-of-horizon request credit',
            );
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
        },
        HEAVY_TEST_TIMEOUT_MS,
    );

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

        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

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

    it(
        'renders a non-empty reason line for every DifferenceReason produced by a real advisor',
        () => {
            const { advisor, results } = fundedOptimumResults();
            const advice = advisor.assemble(results);

            const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

            if (view.kind !== AdviceDisplayKind.Ready) {
                throw new Error('expected ready advice');
            }
            expect(view.reasons.length).toBeGreaterThan(0);
            expect(
                view.reasons.some(
                    (reason) =>
                        reason.kind ===
                        DifferenceReason.HorizonCreditOneRequest,
                ),
            ).toBe(true);
            for (const reason of view.reasons) {
                expect(reason.text.length).toBeGreaterThan(0);
            }
        },
        HEAVY_TEST_TIMEOUT_MS,
    );

    it('renders a non-empty text for every assumption, including live-triggers-not-checked', () => {
        const advisor = fundedAdvisor();
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

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
        expect(
            payoutBlockReasonText(payoutPendingBlockReason()).length,
        ).toBeGreaterThan(0);
        expect(
            payoutBlockReasonText(
                wouldTriggerLiveBlockReason({
                    payoutsTaken: 2,
                    scope: LiveTriggerScope.Account,
                    triggerAtPayoutCount: 3,
                }),
            ).length,
        ).toBeGreaterThan(0);
    });

    it('words the would-trigger-live block per scope: this account for a per-account limit, the firm since its last live account for a firm total (PT-36d)', () => {
        const account = payoutBlockReasonText(
            wouldTriggerLiveBlockReason({
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 3,
            }),
        );
        const firm = payoutBlockReasonText(
            wouldTriggerLiveBlockReason({
                payoutsTaken: 9,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 10,
            }),
        );
        expect(account).toBe(
            'this payout would trigger a live-account transition (2 of 3 payouts taken on this account)',
        );
        expect(account).not.toContain('last live account');
        expect(firm).toBe(
            "this payout would trigger a live-account transition (9 of 10 payouts taken across the firm's accounts since the last live account)",
        );
    });

    it('shares one PayoutGate and PayoutBlockReason text mapping with the payout planner (PT-34b)', () => {
        expect(payoutBlockReasonText).toBe(plannerPayoutBlockReasonText);
    });

    it("shows the daily plan card's rungs and stop reason as text, and every rung and step passes the sizing invariant", () => {
        const advisor = fundedAdvisor();
        const advice = advisor.assemble([]);

        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard).not.toBeNull();
        if (view.dailyPlanCard === null) return;
        expect(view.dailyPlanCard.rungs.length).toBeGreaterThan(0);
        expect(view.dailyPlanCard.stopReasonText.length).toBeGreaterThan(0);

        const documented = advisor.documented();
        if (documented === null) throw new Error('expected documented sizing');
        const context = ruleContextAt(
            plan,
            SizingStage.Funded,
            fundedAccount().state,
            {
                ceiling: null,
                instrument: null,
                personalCaps: NO_PERSONAL_CAPS,
                personalDll: null,
            },
        );
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

    it(
        'never mentions Kelly in the funded or eval advice view model',
        () => {
            const fundedView = adviceViewModel(
                fundedAdvisor().assemble(fundedOptimumResults().results),
                NO_PERSONAL_LIMITS,
            );

            const evalResults = smallLadderResults(evalAdvisor());
            const evalView = adviceViewModel(
                evalAdvisor().assemble(evalResults),
                NO_PERSONAL_LIMITS,
            );

            expect(JSON.stringify(fundedView).toLowerCase()).not.toContain(
                'kelly',
            );
            expect(JSON.stringify(evalView).toLowerCase()).not.toContain(
                'kelly',
            );
        },
        HEAVY_TEST_TIMEOUT_MS,
    );

    it('reports the ladder search optimum by source for an eval account', () => {
        const advisor = evalAdvisor();
        const results = smallLadderResults(advisor);

        const view = adviceViewModel(
            advisor.assemble(results),
            NO_PERSONAL_LIMITS,
        );

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

        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

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
        const view = adviceViewModel(
            fundedAdvisor().assemble([]),
            NO_PERSONAL_LIMITS,
        );

        expect(view.action).toBe(AccountAction.Trade);
    });

    it('carries EnterSnapshot, not an amount, for stale advice', () => {
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 252,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-01-01',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });

        const view = adviceViewModel(advisor.assemble([]), NO_PERSONAL_LIMITS);

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

        expect(adviceViewModel(stopped, NO_PERSONAL_LIMITS).action).toBe(
            AccountAction.StopForToday,
        );
    });

    it('leaves the daily card values null until the value run fills them', () => {
        const view = adviceViewModel(
            fundedAdvisor().assemble([]),
            NO_PERSONAL_LIMITS,
        );

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

        const view = adviceViewModel(filled, NO_PERSONAL_LIMITS);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard?.valueNow).toBe(1000);
        expect(view.dailyPlanCard?.valueAfterWin).toBe(1400);
        expect(view.dailyPlanCard?.valueAfterLoss).toBe(700);
    });
});

function nextPayoutRowText(projection: NextPayoutProjection): string {
    const advice = fundedAdvisor().assemble([
        { projection, source: AdviceSource.NextPayoutProjection },
    ]);
    const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    const row = view.optima.find(
        (candidate) => candidate.source === AdviceSource.NextPayoutProjection,
    );
    if (row === undefined) throw new Error('no next payout projection row');
    return row.text;
}

function projectionWith(
    overrides: Partial<NextPayoutProjection>,
): NextPayoutProjection {
    return {
        accountLostBeforeFirstPayoutProbability: 0.1,
        accountLostBeforeFirstPayoutStandardError: 0.01,
        alreadyEligible: false,
        expectedCalendarDaysToFirstPayout: { standardError: 0.5, value: 12.3 },
        expectedResetFeeBeforeFirstPayout: { standardError: 0, value: 0 },
        expectedSessionDaysToFirstPayout: { standardError: 0.4, value: 9 },
        firstPayoutCausedBreachProbability: 0,
        firstPayoutCausedBreachStandardError: 0,
        payingTrials: 150,
        trials: 200,
        ...overrides,
    };
}

describe('the next payout row of the advice panel reads the engine eligibility (PT-68c, F-V18)', () => {
    it('says eligible now for an already-eligible projection and never prints zero sessions', () => {
        const text = nextPayoutRowText(
            projectionWith({
                alreadyEligible: true,
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                expectedSessionDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                payingTrials: 200,
            }),
        );
        expect(text).toContain('Eligible now');
        expect(text).not.toContain('sessions');
    });

    it('carries the eligible-now caveat on an already-eligible row and on no other row (PT-68e, F-V18)', () => {
        const eligible = nextPayoutRowText(
            projectionWith({ alreadyEligible: true, payingTrials: 200 }),
        );
        expect(eligible).toContain(NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT);
        expect(nextPayoutRowText(projectionWith({}))).not.toContain(
            NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT,
        );
    });

    it('attributes an already-eligible row to the eligibility check and prints no simulated trial count', () => {
        const text = nextPayoutRowText(
            projectionWith({
                alreadyEligible: true,
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                expectedSessionDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                payingTrials: 200,
            }),
        );
        expect(text).toContain("the engine's payout eligibility check");
        expect(text).toContain('no trials were simulated');
        expect(text).not.toContain('trials reached a payout');
        expect(text).not.toContain('200');
    });

    it('says no trial reached a payout when none paid, never zero sessions', () => {
        const text = nextPayoutRowText(
            projectionWith({
                expectedCalendarDaysToFirstPayout: {
                    standardError: null,
                    value: 0,
                },
                expectedSessionDaysToFirstPayout: {
                    standardError: null,
                    value: 0,
                },
                payingTrials: 0,
            }),
        );
        expect(text).toContain('No simulated trial reached a payout');
        expect(text).not.toContain('sessions');
    });

    it('keeps the expected sessions and adds the paying share for a projection that pays', () => {
        const text = nextPayoutRowText(projectionWith({}));
        expect(text).toContain('Expected 9.0 sessions to the first payout');
        expect(text).toContain('150 of 200 trials reached a payout (75.0%)');
    });

    it('says the expected sessions are the mean over the trials that paid', () => {
        const text = nextPayoutRowText(projectionWith({}));
        expect(text).toContain(
            'Expected 9.0 sessions to the first payout among the trials that paid',
        );
    });
});

describe('the engine figures name the personal limits they do not apply (PT-68f, F-V16)', () => {
    const LOOSE_CAPS: PersonalCaps = {
        ...NO_PERSONAL_CAPS,
        maxRiskPerTrade: dollars(1_000_000),
    };

    function limitsOf(
        caps: PersonalCaps,
        dailyLossLimit: Dollars | null = null,
    ): PersonalLimits {
        return { caps, dailyLossLimit };
    }

    const fundedAdviceCache = new Map<
        string,
        ReturnType<typeof buildFundedAdviceWith>
    >();

    function fundedAdviceWith(
        personalCaps: PersonalCaps,
        personalDll: Dollars | null = null,
    ) {
        const key = JSON.stringify([personalCaps, personalDll]);
        const cached = fundedAdviceCache.get(key);
        if (cached !== undefined) return cached;
        const built = buildFundedAdviceWith(personalCaps, personalDll);
        fundedAdviceCache.set(key, built);
        return built;
    }

    function buildFundedAdviceWith(
        personalCaps: PersonalCaps,
        personalDll: Dollars | null,
    ) {
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 30,
            personalCaps,
            personalDll,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });
        return advisor.assemble([
            {
                projection: projectionWith({}),
                source: AdviceSource.NextPayoutProjection,
            },
            ...advisor
                .optimumRequests()
                .filter(
                    (request) =>
                        request.source === AdviceSource.PayoutSizeSweep,
                )
                .map((request) => runEngineOptimum(plan, request)),
        ]);
    }

    function evalAdviceWith(personalCaps: PersonalCaps) {
        const advisor = new EvalSizingAdvisor({
            account: evalAccount(),
            maxEvalDays: 150,
            personalCaps,
            rulebook: DEFAULT_RULEBOOK,
            sims: 20,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        });
        return advisor.assemble(smallLadderResults(advisor));
    }

    function ladderRowOf(view: ReturnType<typeof readyView>) {
        const row = view.optima.find(
            (candidate) => candidate.source === AdviceSource.LadderSearchFresh,
        );
        if (row === undefined) throw new Error('expected a ladder row');
        return row;
    }

    function readyView(
        advice: ReturnType<typeof fundedAdviceWith>,
        limits: PersonalLimits,
    ) {
        const view = adviceViewModel(advice, limits);
        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        return view;
    }

    function rowOf(view: ReturnType<typeof readyView>, source: AdviceSource) {
        const row = view.optima.find(
            (candidate) => candidate.source === source,
        );
        if (row === undefined) throw new Error(`expected a ${source} row`);
        return row;
    }

    function freshSweepViewWith(limits: PersonalLimits) {
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 30,
            personalCaps: limits.caps,
            personalDll: limits.dailyLossLimit,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });
        const fresh = advisor
            .optimumRequests()
            .find(
                (request) => request.source === AdviceSource.FundedSweepFresh,
            );
        if (fresh === undefined) {
            throw new Error('expected a fresh sweep request');
        }
        return readyView(
            advisor.assemble([runEngineOptimum(plan, fresh)]),
            limits,
        );
    }

    it('has no generic not-simulated disclosure left: the constant, the enum member and the view model field are gone', () => {
        expect(Object.values(DocumentedPolicyDisclosure)).not.toContain(
            'personal-caps-not-simulated',
        );
        const view = readyView(
            fundedAdviceWith(NO_PERSONAL_CAPS),
            limitsOf(NO_PERSONAL_CAPS),
        );
        expect('engineFigureNote' in view).toBe(false);
    });

    it('says nothing when no personal limit is set', () => {
        const view = readyView(
            fundedAdviceWith(NO_PERSONAL_CAPS),
            limitsOf(NO_PERSONAL_CAPS),
        );

        for (const row of view.optima) {
            expect(row.text).not.toContain('your ');
        }
        expect(
            view.assumptions.some((item) => item.text.includes('do not apply')),
        ).toBe(false);
    });

    it.each([
        [
            'a personal max risk',
            limitsOf({ ...NO_PERSONAL_CAPS, maxRiskPerTrade: dollars(5) }),
        ],
        ['a loose personal max risk', limitsOf(LOOSE_CAPS)],
        [
            'a max trades per day',
            limitsOf({ ...NO_PERSONAL_CAPS, maxTradesPerDay: 2 }),
        ],
    ])(
        'says nothing about %s: the engine figures simulate it',
        (_name, limits) => {
            const view = readyView(fundedAdviceWith(limits.caps), limits);

            for (const row of view.optima) {
                expect(row.text).not.toContain('do not apply');
            }
            expect(
                view.assumptions.some((item) =>
                    item.text.includes('do not apply'),
                ),
            ).toBe(false);
        },
    );

    it(
        'names no day limit on the next-payout, payout-size or fresh sweep rows: the engine simulates each of them',
        () => {
            const limits = limitsOf(
                { ...NO_PERSONAL_CAPS, dailyProfitCap: dollars(700) },
                dollars(600),
            );
            const view = readyView(
                fundedAdviceWith(limits.caps, dollars(600)),
                limits,
            );

            expect(view.optima.length).toBeGreaterThan(0);
            for (const row of view.optima) {
                expect(row.text).not.toContain('do not apply');
            }
            expect(
                view.assumptions.some((item) =>
                    item.text.includes('do not apply'),
                ),
            ).toBe(false);
        },
        HEAVY_TEST_TIMEOUT_MS,
    );

    it('names no limit on the fresh funded sweep row either', () => {
        const limits = limitsOf(NO_PERSONAL_CAPS, dollars(600));
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 30,
            personalCaps: limits.caps,
            personalDll: dollars(600),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });
        const fresh = advisor
            .optimumRequests()
            .find(
                (request) => request.source === AdviceSource.FundedSweepFresh,
            );
        if (fresh === undefined)
            throw new Error('expected a fresh sweep request');

        const view = readyView(
            advisor.assemble([runEngineOptimum(plan, fresh)]),
            limits,
        );

        expect(rowOf(view, AdviceSource.FundedSweepFresh).text).not.toContain(
            'do not apply',
        );
    });

    it('leaves the ladder search row alone when the personal max risk and max trades are the only limits, because the grid simulates both', () => {
        const caps = {
            ...NO_PERSONAL_CAPS,
            maxRiskPerTrade: dollars(250),
            maxTradesPerDay: 2,
        };
        const view = readyView(evalAdviceWith(caps), limitsOf(caps));

        expect(ladderRowOf(view).text).not.toContain('do not apply');
    });

    it.each([
        [
            'a daily profit cap',
            limitsOf({ ...NO_PERSONAL_CAPS, dailyProfitCap: dollars(300) }),
        ],
        ['a personal DLL', limitsOf(NO_PERSONAL_CAPS, dollars(600))],
        [
            'a max risk beside a daily profit cap',
            limitsOf({
                ...NO_PERSONAL_CAPS,
                dailyProfitCap: dollars(300),
                maxRiskPerTrade: dollars(5),
            }),
        ],
    ])(
        'names no limit on the ladder search row when %s is set, because the ladder score applies it',
        (_name, limits) => {
            const view = readyView(evalAdviceWith(limits.caps), limits);

            expect(ladderRowOf(view).text).not.toContain('do not apply');
        },
    );

    describe('rows that apply the day limits say what they applied (PT-68h, F-V16)', () => {
        const BOTH = limitsOf(
            { ...NO_PERSONAL_CAPS, dailyProfitCap: dollars(700) },
            dollars(600),
        );
        const APPLIED =
            'Simulated under your daily loss limit $600.00 and daily profit cap $700.00';

        it('names both limits and the day semantics on the fresh funded sweep row', () => {
            const { text } = rowOf(
                freshSweepViewWith(BOTH),
                AdviceSource.FundedSweepFresh,
            );

            expect(text).toContain(APPLIED);
            expect(text).toContain('a win does not give loss room back');
            expect(text).toContain(
                'the last trade is sized so it cannot cross either',
            );
            expect(text).toContain(
                'commission is not counted against the loss limit',
            );
        });

        it('names only the limit that is set', () => {
            const lossOnly = limitsOf(NO_PERSONAL_CAPS, dollars(600));
            const { text } = rowOf(
                freshSweepViewWith(lossOnly),
                AdviceSource.FundedSweepFresh,
            );

            expect(text).toContain(
                'Simulated under your daily loss limit $600.00:',
            );
            expect(text).not.toContain('daily profit cap');
        });

        it(
            'names the limits on the next-payout projection and the payout-size sweep rows',
            () => {
                const view = readyView(
                    fundedAdviceWith(BOTH.caps, dollars(600)),
                    BOTH,
                );

                expect(
                    rowOf(view, AdviceSource.NextPayoutProjection).text,
                ).toContain(APPLIED);
                expect(
                    rowOf(view, AdviceSource.PayoutSizeSweep).text,
                ).toContain(APPLIED);
            },
            HEAVY_TEST_TIMEOUT_MS,
        );

        it('names the limits on the ladder row with the ladder rule: cut rungs, every day path inside both limits, no grid rounding', () => {
            const view = readyView(
                evalAdviceWith(BOTH.caps),
                limitsOf(BOTH.caps),
            );
            const { text } = ladderRowOf(view);

            expect(text).toContain(
                'Simulated under your daily profit cap $700.00',
            );
            expect(text).toContain(
                'every win and loss path of the day stays inside the limits',
            );
            expect(text).toContain('rungs are not rounded to the grid step');
        });

        it('says nothing on any row when no day limit is set, even with a max risk and max trades', () => {
            const caps = {
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(250),
                maxTradesPerDay: 2,
            };
            const view = readyView(fundedAdviceWith(caps), limitsOf(caps));

            for (const row of view.optima) {
                expect(row.text).not.toContain('Simulated under your');
            }
        });

        it('names the applied limits on the from-state sweep row too, now that its sweep applies them (PT-68h follow-up)', () => {
            const advisor = new FundedSizingAdvisor({
                account: fundedAccount({
                    state: accountState({ elapsedDays: 12, tradingDays: 12 }),
                }),
                fundedHorizonDays: 30,
                personalCaps: BOTH.caps,
                personalDll: dollars(600),
                rulebook: DEFAULT_RULEBOOK,
                snapshotAsOf: '2026-09-26',
                substate: null,
                today: '2026-09-26',
                trials: 20,
            });
            const fromState = advisor
                .optimumRequests()
                .find(
                    (request) =>
                        request.source === AdviceSource.FundedSweepFromState,
                );
            if (fromState === undefined) {
                throw new Error('expected a from-state sweep request');
            }

            const view = readyView(
                advisor.assemble([runEngineOptimum(plan, fromState)]),
                BOTH,
            );
            const { text } = rowOf(view, AdviceSource.FundedSweepFromState);

            expect(text).toContain(APPLIED);
            expect(text).not.toContain('do not apply');
        });
    });

    it('names the daily loss limit and the daily profit cap on the from-state sweep row as applied, and no row names an unapplied limit (PT-68h follow-up)', () => {
        const limits = limitsOf(
            { ...NO_PERSONAL_CAPS, dailyProfitCap: dollars(700) },
            dollars(600),
        );
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount({
                state: accountState({ elapsedDays: 12, tradingDays: 12 }),
            }),
            fundedHorizonDays: 30,
            personalCaps: limits.caps,
            personalDll: dollars(600),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });
        const fromState = advisor
            .optimumRequests()
            .find(
                (request) =>
                    request.source === AdviceSource.FundedSweepFromState,
            );
        if (fromState === undefined) {
            throw new Error('expected a from-state sweep request');
        }

        const view = readyView(
            advisor.assemble([runEngineOptimum(plan, fromState)]),
            limits,
        );
        const { text } = rowOf(view, AdviceSource.FundedSweepFromState);

        expect(text).toContain('daily loss limit $600.00');
        expect(text).toContain('daily profit cap $700.00');
        expect(text.split('Simulated under your').length - 1).toBe(1);
        for (const row of view.optima) {
            expect(row.text).not.toContain('do not apply');
        }
    });
});
