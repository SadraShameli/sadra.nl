import { describe, expect, it } from 'vitest';

import {
    fundedTierOptions,
    positionSizeFor,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import {
    decodePositionSize,
    PositionSizeUrlParameter,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { formatRiskDisplay } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import {
    AdvisorRequestOutcomeKind,
    advisorValueOutcomeOf,
    type AdvisorValueRequest,
    type AdvisorValueResult,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    ACCOUNT_ACTION_TEXT,
    accountActionFor,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/accountActionModel';
import {
    AdviceValueRequestKind,
    adviceValueRequestOf,
    adviceValueViewOf,
    adviceWithValues,
    candidateRiskGridOf,
    EVAL_CANDIDATES_NOTE_TEXT,
    evSwingViewsOf,
    filledDailyPlanCard,
    flatRiskReasonOf,
    oneStepTreeOf,
    payoutStakeViewOf,
    riskCandidatesViewOf,
    SESSION_BOUNDARY_CONTINUES_TEXT,
    valueRunNoteOf,
    ValueSectionKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import { contractsSizingOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/contractsSizingModel';
import {
    dayStopReasonOf,
    EMPTY_RISK_CHECK_INPUTS,
    parseDayCounts,
    parseRiskCheckInputs,
    payoutFlagExcessOf,
    RiskCheckInputKind,
    riskChecksOf,
    riskCheckViewOf,
    todaysDecisionsOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/riskCheckModel';
import { formatCurrency } from '~/lib/format';
import { usdCentsFromDollars } from '~/lib/prop-accounts';
import {
    type AccountState,
    ALL_FIRMS,
    contractLimitAt,
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    points,
    TierBasis,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountAction,
    type Advice,
    AdviceSource,
    AdviceStalenessReason,
    type DailyPlanCard,
    DayStopReason,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    FundedSizingAdvisor,
    NextTradeRiskVerdict,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    RetainedCushionBasis,
    RiskDisplayUnit,
    RuleSource,
    SizingObjective,
    SizingProvenance,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { type NextTradeRiskCheckResult } from '~/lib/prop-calculator/advisor/actions';
import {
    CreditBasis,
    RISK_CANDIDATE_LABEL,
    RiskCandidateBasis,
    type RiskCandidateRow,
    type RiskCandidateValuesResult,
    TRADE_VALUE_SWING_ASSUMPTION,
    type TradeValueSwingResult,
    valueGap,
    valueResult,
    type ValueResult,
    ValueResultKind,
    ValueUnavailableReason,
} from '~/lib/prop-calculator/advisor/value';
import {
    contracts,
    DayStopRuleKind,
    PayoutGate,
} from '~/lib/prop-calculator/core';
import { routes } from '~/lib/site/routes';

const plan = topStep50k();

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

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker({
            ...state,
            balance: state.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function fundedAdvisor(): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
        trials: 20,
    });
}

function swingResult(
    overrides: Partial<TradeValueSwingResult> = {},
): TradeValueSwingResult {
    const now = value(1000, 10, 1100, 12);
    const afterWin = value(1400, 10, 1520, 12);
    const afterLoss = value(700, 8, 760, 9);
    return {
        afterLoss,
        afterLossBusted: false,
        afterLossRebuyLagDays: null,
        afterWin,
        assumption: TRADE_VALUE_SWING_ASSUMPTION,
        deltaLoss: valueGap(now, afterLoss),
        deltaWin: valueGap(now, afterWin),
        kind: ValueResultKind.Swing,
        now,
        winProbability: 0.4,
        ...overrides,
    };
}

function topStep50k(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K missing');
    return found;
}

function value(
    creditFree: number,
    creditFreeSe: null | number,
    creditInclusive: number,
    creditInclusiveSe: null | number,
): ValueResult {
    return valueResult(
        {
            creditFree: { standardError: creditFreeSe, value: creditFree },
            creditInclusive: {
                standardError: creditInclusiveSe,
                value: creditInclusive,
            },
        },
        9,
        100,
    );
}

const FUNDED_CONTEXT = {
    phase: TradingPhase.Funded,
    plan,
    unit: RiskDisplayUnit.AccountDollars,
};

const EVAL_CONTEXT = { ...FUNDED_CONTEXT, phase: TradingPhase.Eval };

const REPLACEMENT_FEE = plan.retryFee();

function candidateRowOf(
    placedRisk: number,
    netOfDurationCharge: number,
): RiskCandidateRow {
    return {
        continuationValue: {
            standardError: 6,
            value: netOfDurationCharge + 20,
        },
        monthlyNetCharge: 20,
        netOfDurationCharge,
        placement: { contracts: null, intendedRisk: placedRisk, placedRisk },
        swing: swingResult(),
    };
}

function candidatesOf(
    rows: readonly RiskCandidateRow[],
): RiskCandidateValuesResult {
    return {
        basis: RiskCandidateBasis.Simulator,
        kind: ValueResultKind.Candidates,
        label: RISK_CANDIDATE_LABEL,
        rows,
    };
}

function decision(
    id: string,
    actualRisk: null | number,
    decidedOn = '2026-09-27',
) {
    return {
        actualRiskCents:
            actualRisk === null ? null : usdCentsFromDollars(actualRisk),
        decidedOn,
        id,
    };
}

function failedSwing(reason: string) {
    return {
        outcome: {
            kind: AdvisorRequestOutcomeKind.Failed as const,
            reason,
        },
        rung: { risk: 250, rr: 2 },
    };
}

function flatRowOf(
    placedRisk: number,
    value: number,
    standardError: number,
): RiskCandidateRow {
    return {
        continuationValue: { standardError, value },
        monthlyNetCharge: 0,
        netOfDurationCharge: value,
        placement: { contracts: null, intendedRisk: placedRisk, placedRisk },
        swing: swingResult(),
    };
}

function succeeded<T>(valueOf: T) {
    return {
        kind: AdvisorRequestOutcomeKind.Succeeded as const,
        value: valueOf,
    };
}

describe('evSwingViewsOf (PT-67 step 1)', () => {
    it('gives per rung the win and loss EV change on the credit-free basis with their standard errors', () => {
        const swing = swingResult();

        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swing), rung: { risk: 250, rr: 2 } }],
            FUNDED_CONTEXT,
        );

        expect(view?.kind).toBe(ValueSectionKind.Ready);
        if (view?.kind !== ValueSectionKind.Ready) return;
        expect(view.row.index).toBe(1);
        expect(view.row.winDelta.value).toBe(400);
        expect(view.row.winDelta.standardError).toBeCloseTo(
            Math.hypot(10, 10),
            10,
        );
        expect(view.row.lossDelta.value).toBe(-300);
        expect(view.row.lossDelta.standardError).toBeCloseTo(
            Math.hypot(10, 8),
            10,
        );
        expect(view.row.winProbability).toBe(0.4);
        expect(view.row.rr).toBe(2);
    });

    it('measures the gaps with valueGap on the credit-free basis, not the credit-inclusive one', () => {
        const swing = swingResult();

        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swing), rung: { risk: 250, rr: 2 } }],
            FUNDED_CONTEXT,
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.winDelta).toEqual(
            valueGap(swing.now, swing.afterWin, CreditBasis.CreditFree),
        );
        expect(view.row.winDelta.value).not.toBe(swing.deltaWin.value);
    });

    it('numbers the rungs in order and states a failed swing and a not-modeled swing instead of dropping them', () => {
        const views = evSwingViewsOf(
            [
                {
                    outcome: succeeded(swingResult()),
                    rung: { risk: 250, rr: 2 },
                },
                {
                    outcome: {
                        kind: AdvisorRequestOutcomeKind.Failed,
                        reason: 'the engine refused this start',
                    },
                    rung: { risk: 500, rr: 2 },
                },
                {
                    outcome: succeeded({
                        kind: ValueResultKind.NotModeled as const,
                        reason: ValueUnavailableReason.LiveNotModeled,
                    }),
                    rung: { risk: 750, rr: 2 },
                },
            ],
            FUNDED_CONTEXT,
        );

        expect(views.map((view) => view.kind)).toEqual([
            ValueSectionKind.Ready,
            ValueSectionKind.Failed,
            ValueSectionKind.NotModeled,
        ]);
        expect(views[1]).toMatchObject({
            index: 2,
            reason: 'the engine refused this start',
        });
        expect(views[2]).toMatchObject({ index: 3 });
    });

    it('flags a loss that busts the account with its rebuy lag', () => {
        const swing = swingResult({
            afterLossBusted: true,
            afterLossRebuyLagDays: 4,
        });

        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swing), rung: { risk: 250, rr: 2 } }],
            EVAL_CONTEXT,
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.bust).toEqual({
            rebuyLagDays: 4,
            replacementFee: REPLACEMENT_FEE,
        });
    });

    it('shows the risk in the unit the user chose through riskDisplay (account dollars)', () => {
        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swingResult()), rung: { risk: 250, rr: 2 } }],
            FUNDED_CONTEXT,
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.risk).toEqual(
            formatRiskDisplay(RiskDisplayUnit.AccountDollars, {
                accountDollars: 250,
                evAtStake: null,
                feeEquivalent: null,
            }),
        );
    });

    it('shows EV at stake for a funded loss as the credit-free value lost', () => {
        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swingResult()), rung: { risk: 250, rr: 2 } }],
            { ...FUNDED_CONTEXT, unit: RiskDisplayUnit.EvAtStake },
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.risk.isFallback).toBe(false);
        expect(view.row.risk.label).toBe('EV at stake');
        expect(view.row.risk.text).toBe(formatCurrency(300));
    });

    it('prices the bust of an eval as V(now) - V(fresh eval) + the retry fee, never a sum of fees paid', () => {
        const swing = swingResult({
            afterLoss: value(120, 5, 150, 6),
            afterLossBusted: true,
            afterLossRebuyLagDays: 0,
        });

        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swing), rung: { risk: 250, rr: 2 } }],
            { ...EVAL_CONTEXT, unit: RiskDisplayUnit.EvAtStake },
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        const expected = 1000 - 120 + plan.retryFee();
        expect(view.row.risk.text).toBe(formatCurrency(expected));
        expect(view.row.risk.label).toBe('EV at stake');
    });

    it('prices a loss that busts as minus its bust cost, the replacement fee included, so the loss figure and the EV at stake agree', () => {
        const swing = swingResult({
            afterLoss: value(120, 5, 150, 6),
            afterLossBusted: true,
            afterLossRebuyLagDays: 3,
        });

        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swing), rung: { risk: 250, rr: 2 } }],
            { ...EVAL_CONTEXT, unit: RiskDisplayUnit.EvAtStake },
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.lossDelta.value).toBeCloseTo(
            120 - 1000 - REPLACEMENT_FEE,
            10,
        );
        expect(view.row.lossDelta.standardError).toBeCloseTo(
            Math.hypot(10, 5),
            10,
        );
        expect(view.row.risk.text).toBe(
            formatCurrency(-view.row.lossDelta.value),
        );
        expect(view.row.winDelta.value).toBe(400);
    });

    it('does not add the replacement fee to a loss that does not bust', () => {
        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swingResult()), rung: { risk: 250, rr: 2 } }],
            EVAL_CONTEXT,
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.lossDelta.value).toBe(-300);
        expect(view.row.bust).toBeNull();
    });

    it('passes an engine refusal through unchanged for an eval and a funded account alike, with no eval-specific rewrite', () => {
        const message = 'the account has already passed the eval';
        const [evalView] = evSwingViewsOf([failedSwing(message)], EVAL_CONTEXT);
        const [fundedView] = evSwingViewsOf(
            [failedSwing(message)],
            FUNDED_CONTEXT,
        );

        expect(evalView).toMatchObject({
            kind: ValueSectionKind.Failed,
            reason: message,
        });
        expect(fundedView).toMatchObject({
            kind: ValueSectionKind.Failed,
            reason: message,
        });
    });

    it('shows a real swing for an eval account instead of a fixed not-modeled line', () => {
        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swingResult()), rung: { risk: 500, rr: 2 } }],
            EVAL_CONTEXT,
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.winDelta.value).toBe(400);
        expect(view.row.lossDelta.value).toBe(-300);
    });

    it('shows the fee equivalent for an eval from the retry fee scaled by risk over the drawdown', () => {
        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swingResult()), rung: { risk: 500, rr: 2 } }],
            { ...EVAL_CONTEXT, unit: RiskDisplayUnit.FeeEquivalent },
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        const expected =
            Math.min(500 / plan.drawdown.amount, 1) * plan.retryFee();
        expect(view.row.risk.text).toBe(formatCurrency(expected));
    });

    it('falls back with a label when the fee equivalent has no value for a funded account', () => {
        const [view] = evSwingViewsOf(
            [{ outcome: succeeded(swingResult()), rung: { risk: 500, rr: 2 } }],
            { ...FUNDED_CONTEXT, unit: RiskDisplayUnit.FeeEquivalent },
        );

        if (view?.kind !== ValueSectionKind.Ready)
            throw new Error('expected a row');
        expect(view.row.risk.label).toBe('Fee equivalent');
        expect(view.row.risk.text).not.toContain('$');
    });
});

describe('oneStepTreeOf (PT-67 step 1)', () => {
    it('lays out V now, V after a win, V after a loss and p on the credit-free basis', () => {
        const tree = oneStepTreeOf(swingResult(), REPLACEMENT_FEE);

        expect(tree.valueNow).toEqual({ standardError: 10, value: 1000 });
        expect(tree.valueAfterWin).toEqual({ standardError: 10, value: 1400 });
        expect(tree.valueAfterLoss).toEqual({ standardError: 8, value: 700 });
        expect(tree.winProbability).toBe(0.4);
    });

    it('computes the continuation value as p x V(win) + (1 - p) x V(loss) with the conservative standard error', () => {
        const tree = oneStepTreeOf(swingResult(), REPLACEMENT_FEE);

        expect(tree.continuation.value).toBeCloseTo(0.4 * 1400 + 0.6 * 700, 10);
        expect(tree.continuation.standardError).toBeCloseTo(
            Math.hypot(10, 8),
            10,
        );
    });
});

describe('a loss that busts the account (PT-67 review)', () => {
    const bustSwing = swingResult({
        afterLoss: value(120, 5, 150, 6),
        afterLossBusted: true,
        afterLossRebuyLagDays: 0,
    });

    it('values the tree loss branch and the continuation net of the replacement fee and says so', () => {
        const tree = oneStepTreeOf(bustSwing, REPLACEMENT_FEE);

        expect(tree.valueAfterLoss.value).toBeCloseTo(
            120 - REPLACEMENT_FEE,
            10,
        );
        expect(tree.valueAfterLoss.standardError).toBe(5);
        expect(tree.continuation.value).toBeCloseTo(
            0.4 * 1400 + 0.6 * (120 - REPLACEMENT_FEE),
            10,
        );
        expect(tree.replacementFee).toBe(REPLACEMENT_FEE);
        expect(
            oneStepTreeOf(swingResult(), REPLACEMENT_FEE).replacementFee,
        ).toBeNull();
    });

    it('fills the daily card loss value net of the replacement fee', () => {
        const filled = filledDailyPlanCard(
            {
                rungs: [],
                stopCappedBy: [],
                stopReason: DayStopReason.MaxTrades,
                valueAfterLoss: null,
                valueAfterWin: null,
                valueNow: null,
            },
            bustSwing,
            REPLACEMENT_FEE,
        );

        expect(filled.valueAfterLoss).toBeCloseTo(120 - REPLACEMENT_FEE, 10);
        expect(filled.valueAfterWin).toBe(1400);
        expect(filled.valueNow).toBe(1000);
    });

    it('ranks a candidate whose loss busts net of the replacement fee weighted by the chance of that loss', () => {
        const bustRow: RiskCandidateRow = {
            ...candidateRowOf(500, 880 + 0.3 * REPLACEMENT_FEE),
            swing: bustSwing,
        };
        const safeRow = candidateRowOf(250, 880);

        const view = riskCandidatesViewOf(
            candidatesOf([bustRow, safeRow]),
            250,
            FUNDED_CONTEXT,
        );

        expect(view.rows.map((row) => row.riskDollars)).toEqual([250, 500]);
        expect(view.rows.map((row) => row.rank)).toEqual([1, 2]);
        expect(view.rows[1]?.netOfDurationCharge).toBeCloseTo(
            880 + 0.3 * REPLACEMENT_FEE - 0.6 * REPLACEMENT_FEE,
            10,
        );
        expect(view.rows[1]?.continuation.value).toBeCloseTo(
            bustRow.continuationValue.value - 0.6 * REPLACEMENT_FEE,
            10,
        );
        expect(view.rows[1]?.risk.text).toBe(
            formatRiskDisplay(RiskDisplayUnit.AccountDollars, {
                accountDollars: 500,
                evAtStake: null,
                feeEquivalent: null,
            }).text,
        );
    });

    it('judges the flat-risk reason on candidate values net of the replacement fee', () => {
        const bustRow: RiskCandidateRow = {
            ...flatRowOf(500, 900 + 0.3 * REPLACEMENT_FEE, 1),
            swing: bustSwing,
        };
        const documented = flatRowOf(250, 900, 1);
        const candidates = candidatesOf([bustRow, documented]);

        expect(flatRiskReasonOf(candidates, 250, 0)).not.toBeNull();
        expect(flatRiskReasonOf(candidates, 250, REPLACEMENT_FEE)).toBeNull();
    });
});

describe('riskCandidatesViewOf (PT-67 step 1)', () => {
    it('keeps the library ranking, labels the comparison and marks the documented rung', () => {
        const view = riskCandidatesViewOf(
            candidatesOf([
                candidateRowOf(250, 900),
                candidateRowOf(500, 880),
                candidateRowOf(125, 700),
            ]),
            500,
            FUNDED_CONTEXT,
        );

        expect(view.label).toBe(
            'one-step comparison, documented sizing afterwards',
        );
        expect(view.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
        expect(view.rows.map((r) => r.riskDollars)).toEqual([250, 500, 125]);
        expect(view.rows.map((r) => r.isDocumented)).toEqual([
            false,
            true,
            false,
        ]);
    });

    it('ranks a funded table and flags the first row as the engine optimum, with no sizing note', () => {
        const view = riskCandidatesViewOf(
            candidatesOf([candidateRowOf(250, 900), candidateRowOf(500, 880)]),
            500,
            FUNDED_CONTEXT,
        );

        expect(view.isRanked).toBe(true);
        expect(view.sizingNote).toBeNull();
        expect(view.rows.map((r) => r.isEngineOptimum)).toEqual([true, false]);
    });

    it('never ranks an eval table: the documented rung comes first, the engine optimum is only flagged, and the sizing rule is stated', () => {
        const view = riskCandidatesViewOf(
            candidatesOf([
                candidateRowOf(250, 900),
                candidateRowOf(500, 880),
                candidateRowOf(125, 700),
            ]),
            500,
            EVAL_CONTEXT,
        );

        expect(view.isRanked).toBe(false);
        expect(view.sizingNote).toBe(EVAL_CANDIDATES_NOTE_TEXT);
        expect(EVAL_CANDIDATES_NOTE_TEXT).toContain('maximum allowed risk');
        expect(view.rows.map((r) => r.riskDollars)).toEqual([500, 250, 125]);
        expect(view.rows.map((r) => r.isDocumented)).toEqual([
            true,
            false,
            false,
        ]);
        expect(view.rows.map((r) => r.isEngineOptimum)).toEqual([
            false,
            true,
            false,
        ]);
    });

    it('shows every candidate risk through riskDisplay in the chosen unit', () => {
        const view = riskCandidatesViewOf(
            candidatesOf([candidateRowOf(250, 900)]),
            500,
            { ...FUNDED_CONTEXT, unit: RiskDisplayUnit.EvAtStake },
        );

        expect(view.rows[0]?.risk.label).toBe('EV at stake');
        expect(view.rows[0]?.risk.text).toBe(formatCurrency(300));
    });

    it('shows whole contracts when the library placed them and leaves the text empty otherwise', () => {
        const placed: RiskCandidateRow = {
            ...candidateRowOf(250, 900),
            placement: {
                contracts: contracts(2),
                intendedRisk: 260,
                placedRisk: 250,
            },
        };

        const view = riskCandidatesViewOf(
            candidatesOf([placed, candidateRowOf(125, 700)]),
            250,
            FUNDED_CONTEXT,
        );

        expect(view.rows[0]?.contractsText).toBe('2 contracts');
        expect(view.rows[1]?.contractsText).toBeNull();
    });

    it('marks no row as documented when the documented rung is not in the grid', () => {
        const view = riskCandidatesViewOf(
            candidatesOf([candidateRowOf(250, 900)]),
            333,
            FUNDED_CONTEXT,
        );

        expect(view.rows.every((r) => !r.isDocumented)).toBe(true);
    });
});

describe('candidateRiskGridOf', () => {
    it('keeps the documented rung and smaller fractions of it, whole cents, no duplicates, nothing above it', () => {
        expect(candidateRiskGridOf(400)).toEqual([100, 200, 300, 400]);
    });

    it('rounds to whole cents and drops fractions that round to zero', () => {
        const grid = candidateRiskGridOf(0.01);

        expect(grid).toEqual([0.01]);
    });

    it('is empty when there is no positive documented rung', () => {
        expect(candidateRiskGridOf(0)).toEqual([]);
    });
});

describe('filledDailyPlanCard (PT-67 step 1)', () => {
    const card: DailyPlanCard = {
        rungs: [],
        stopCappedBy: [],
        stopReason: DayStopReason.MaxTrades,
        valueAfterLoss: null,
        valueAfterWin: null,
        valueNow: null,
    };

    it('fills valueNow, valueAfterWin and valueAfterLoss from the next trade swing on the credit-free basis', () => {
        const filled = filledDailyPlanCard(
            card,
            swingResult(),
            REPLACEMENT_FEE,
        );

        expect(filled.valueNow).toBe(1000);
        expect(filled.valueAfterWin).toBe(1400);
        expect(filled.valueAfterLoss).toBe(700);
    });

    it('does not mutate the card and leaves the fields null without a swing', () => {
        const unchanged = filledDailyPlanCard(card, null, REPLACEMENT_FEE);

        expect(unchanged).toEqual(card);
        expect(
            filledDailyPlanCard(card, swingResult(), REPLACEMENT_FEE),
        ).not.toBe(card);
        expect(card.valueNow).toBeNull();
    });
});

describe('flatRiskReasonOf (PT-67 step 1, QV-8)', () => {
    it('names the flat-risk reason when the best candidate beats the documented rung beyond noise', () => {
        const reason = flatRiskReasonOf(
            candidatesOf([flatRowOf(250, 1500, 5), flatRowOf(500, 900, 5)]),
            500,
            REPLACEMENT_FEE,
        );

        expect(reason?.kind).toBe(DifferenceReason.FlatRiskIgnoresState);
        if (reason?.kind !== DifferenceReason.FlatRiskIgnoresState) return;
        expect(reason.documentedFlatRisk).toBe(500);
        expect(reason.fromStateOptimum).toBe(250);
        expect(reason.gapInCombinedSEs).toBeCloseTo(600 / Math.hypot(5, 5), 6);
    });

    it('stays silent when the best candidate is within noise of the documented rung', () => {
        const reason = flatRiskReasonOf(
            candidatesOf([flatRowOf(250, 905, 40), flatRowOf(500, 900, 40)]),
            500,
            REPLACEMENT_FEE,
        );

        expect(reason).toBeNull();
    });

    it('stays silent when the documented rung is the best candidate', () => {
        const reason = flatRiskReasonOf(
            candidatesOf([flatRowOf(500, 1500, 5), flatRowOf(250, 900, 5)]),
            500,
            REPLACEMENT_FEE,
        );

        expect(reason).toBeNull();
    });

    it('stays silent when the documented rung is not in the grid or a standard error is unknown', () => {
        const absent = candidatesOf([
            flatRowOf(250, 1500, 5),
            flatRowOf(125, 900, 5),
        ]);
        const unknown: RiskCandidateRow = {
            ...flatRowOf(250, 1500, 5),
            continuationValue: { standardError: null, value: 1500 },
        };
        const unknownError = candidatesOf([unknown, flatRowOf(500, 900, 5)]);

        expect(flatRiskReasonOf(absent, 500, REPLACEMENT_FEE)).toBeNull();
        expect(flatRiskReasonOf(unknownError, 500, REPLACEMENT_FEE)).toBeNull();
    });
});

function adviceFixture(overrides: Partial<Advice> = {}): Advice {
    return {
        assumptions: [],
        dailyPlanCard: {
            rungs: [
                {
                    cappedBy: [],
                    risk: dollars(250),
                    runningLossAfter: dollars(250),
                    runningLossBefore: dollars(0),
                    takeProfit: dollars(500),
                },
            ],
            stopCappedBy: [],
            stopReason: DayStopReason.MaxTrades,
            valueAfterLoss: null,
            valueAfterWin: null,
            valueNow: null,
        },
        differenceReasons: [],
        documented: {
            assumptions: [],
            constraints: [],
            dailyProfitCap: null,
            maxTrades: 4,
            minStopPointsAtCap: null,
            profitCeiling: null,
            provenance: SizingProvenance.FundedFixedRisk,
            rewardMultiple: 2,
            rungs: [
                {
                    cappedBy: [],
                    risk: dollars(250),
                    runningLossAfter: dollars(250),
                    runningLossBefore: dollars(0),
                    takeProfit: dollars(500),
                },
            ],
            sources: [],
            stopRule: { kind: DayStopRuleKind.DayGreen },
        },
        headline: 'your documented rule',
        optima: [],
        payoutAdvice: null,
        provenance: {
            computedAt: '2026-01-10',
            firmDataDate: null,
            objective: SizingObjective.MonthlyNet,
            planRulesFingerprint: null,
            seed: null,
            snapshotDate: '2026-01-10',
            solverVersion: null,
            source: AdviceSource.Documented,
            startBasis: StartBasis.Fresh,
            trials: null,
        },
        requests: [],
        stage: SizingStage.Funded,
        staleness: { kind: 'fresh' },
        ...overrides,
    };
}

const REQUEST_DECISION = {
    kind: PayoutRequestDecisionKind.Request as const,
    notice: null,
    requestAmount: dollars(500),
    retainedCushion: dollars(2000),
    retainedCushionBasis: RetainedCushionBasis.RulebookSize,
    sources: [RuleSource.PayoutSize],
};

function eligibleAdvice(): Advice {
    return adviceFixture({
        payoutAdvice: {
            assumptions: [],
            documented: REQUEST_DECISION,
            engineHorizonCredit: null,
            netAfterSplit: dollars(450),
        },
    });
}

describe('accountActionFor (PT-67 step 2)', () => {
    it('is RequestPayout when the documented payout decision is a request, with the rungs unchanged', () => {
        const advice = eligibleAdvice();

        const { action } = accountActionFor(advice);

        expect(action).toBe(AccountAction.RequestPayout);
        expect(advice.dailyPlanCard?.rungs[0]?.risk).toBe(250);
    });

    it('is Trade when the payout decision is not a request and the day has a rung', () => {
        const advice = adviceFixture({
            payoutAdvice: {
                assumptions: [],
                documented: {
                    kind: PayoutRequestDecisionKind.Unreachable,
                    sources: [],
                },
                engineHorizonCredit: null,
                netAfterSplit: null,
            },
        });

        expect(accountActionFor(advice).action).toBe(AccountAction.Trade);
        expect(accountActionFor(adviceFixture()).action).toBe(
            AccountAction.Trade,
        );
    });

    it('is EnterSnapshot for stale advice, even when a payout request is documented', () => {
        const advice = {
            ...eligibleAdvice(),
            staleness: {
                kind: 'stale' as const,
                noHolidayCalendarDisclosure: false,
                reasons: [AdviceStalenessReason.FundedSnapshotStale],
                snapshotAsOf: '2026-01-01',
            },
        };

        expect(accountActionFor(advice).action).toBe(
            AccountAction.EnterSnapshot,
        );
    });

    it('is StopForToday when the day has no rung', () => {
        const advice = adviceFixture({
            dailyPlanCard: {
                rungs: [],
                stopCappedBy: [],
                stopReason: DayStopReason.NoLossRoom,
                valueAfterLoss: null,
                valueAfterWin: null,
                valueNow: null,
            },
        });

        expect(accountActionFor(advice).action).toBe(
            AccountAction.StopForToday,
        );
    });

    it('is NotModeled when there is no documented sizing, and never Retire (QV-19 off)', () => {
        expect(
            accountActionFor(adviceFixture({ documented: null })).action,
        ).toBe(AccountAction.NotModeled);
        expect(accountActionFor(eligibleAdvice()).retireVerdict).toBeNull();
    });

    it('offers RequestPayout only for a request decision, never for a blocked, waiting or unreachable one', () => {
        const withDecision = (
            documented: NonNullable<Advice['payoutAdvice']>['documented'],
        ) =>
            adviceFixture({
                payoutAdvice: {
                    assumptions: [],
                    documented,
                    engineHorizonCredit: null,
                    netAfterSplit: null,
                },
            });
        const blocked = withDecision({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: {
                gate: PayoutGate.FundedConsistency,
                kind: PayoutBlockReasonKind.Gate,
            },
            sources: [],
        });

        expect(accountActionFor(eligibleAdvice()).action).toBe(
            AccountAction.RequestPayout,
        );
        expect(accountActionFor(blocked).action).toBe(AccountAction.Trade);
        expect(accountActionFor(adviceFixture()).action).toBe(
            AccountAction.Trade,
        );
    });
});

describe('payoutStakeViewOf (PT-67 step 2, QV-18)', () => {
    const stake = {
        continueNow: value(1000, 10, 1100, 12),
        kind: ValueResultKind.PayoutStake as const,
        reducedRiskWhatIf: {
            label: 'what-if: your documented rung is unchanged (QV-18)' as const,
            risk: 125,
            value: value(900, 11, 990, 13),
        },
        requestedAmount: 500,
        requestNow: {
            creditFree: { standardError: 9, value: 1300 },
            creditInclusive: { standardError: 10, value: 1420 },
        },
        traderReceivesNow: 450,
    };

    it('compares requesting now with continuing on the credit-free basis with the conservative standard error', () => {
        const view = payoutStakeViewOf(stake);

        expect(view.requestNow).toEqual({ standardError: 9, value: 1300 });
        expect(view.continueNow).toEqual({ standardError: 10, value: 1000 });
        expect(view.evAtStake.value).toBe(300);
        expect(view.evAtStake.standardError).toBeCloseTo(Math.hypot(9, 10), 10);
        expect(view.traderReceivesNow).toBe(450);
    });

    it('carries the reduced-risk row only as the labelled what-if', () => {
        const view = payoutStakeViewOf(stake);

        expect(view.whatIf).toEqual({
            label: 'what-if: your documented rung is unchanged (QV-18)',
            risk: 125,
            value: { standardError: 11, value: 900 },
        });
        expect(
            payoutStakeViewOf({ ...stake, reducedRiskWhatIf: null }).whatIf,
        ).toBeNull();
    });
});

function checkResult(
    overrides: Partial<NextTradeRiskCheckResult> = {},
): NextTradeRiskCheckResult {
    return {
        documentedRung: dollars(250),
        dpRisk: null,
        excessCents: 0,
        payoutEligibleAboveRung: false,
        stopReason: null,
        verdict: NextTradeRiskVerdict.WithinPlan,
        ...overrides,
    };
}

function flagViewOf(excess: number, isPayoutEligible: boolean) {
    return riskCheckViewOf(
        checkResult({
            excessCents: excess * 100,
            payoutEligibleAboveRung: isPayoutEligible,
            verdict: NextTradeRiskVerdict.AboveDocumented,
        }),
        0,
    );
}

function queryOf(href: string): URLSearchParams {
    const [path, query] = href.split('?', 2);
    expect(path).toBe(routes.propCalculator.positionSize);
    return new URLSearchParams(query);
}

function readyRequestOf(
    input: Parameters<typeof adviceValueRequestOf>[0],
): AdvisorValueRequest {
    const result = adviceValueRequestOf(input);
    if (result.kind !== AdviceValueRequestKind.Ready) {
        throw new Error('expected a value request');
    }
    return result.request;
}

function valueRequestInputOf(
    overrides: Partial<Parameters<typeof adviceValueRequestOf>[0]> = {},
) {
    const advisor = fundedAdvisor();
    const account = fundedAccount();
    return {
        account,
        advice: advisor.assemble([]),
        plan,
        rulebook: DEFAULT_RULEBOOK,
        ...overrides,
    };
}

describe('adviceValueRequestOf (PT-67 steps 1 and 2)', () => {
    it('does not request values for a live account, which has no modeled value', () => {
        const live: ReconstructedAccount = {
            assumptions: [],
            cushion: null,
            kind: ReconstructedLiveKind.Live,
            livePlan: null,
            plan,
            state: null,
        };

        expect(
            adviceValueRequestOf({ ...valueRequestInputOf(), account: live }),
        ).toEqual({ kind: AdviceValueRequestKind.NotRequested });
    });

    it('does not request values for stale advice, which shows no amounts', () => {
        const advice = adviceFixture({
            staleness: {
                kind: 'stale',
                noHolidayCalendarDisclosure: false,
                reasons: [AdviceStalenessReason.FundedSnapshotStale],
                snapshotAsOf: '2026-01-01',
            },
        });

        expect(
            adviceValueRequestOf({ ...valueRequestInputOf(), advice }),
        ).toEqual({
            kind: AdviceValueRequestKind.NotRequested,
        });
    });

    it('states why a funded account that cannot start a value run has no request, instead of going quiet', () => {
        const result = adviceValueRequestOf({
            ...valueRequestInputOf(),
            account: { ...fundedAccount(), fundedTracker: null },
        });

        expect(result.kind).toBe(AdviceValueRequestKind.Failed);
        if (result.kind !== AdviceValueRequestKind.Failed) return;
        expect(result.reason).toContain('funded cycle tracker');
    });

    it('builds a swing for each rung at the rung reward multiple and the candidate grid at the rulebook rr', () => {
        const request = readyRequestOf(valueRequestInputOf());

        const rungs = fundedAdvisor().dailyPlanCard()?.rungs ?? [];
        expect(request.rungs).toEqual(
            rungs.map((rung) => ({
                risk: rung.risk,
                rr: rung.takeProfit / rung.risk,
            })),
        );
        expect(request.rr).toBe(DEFAULT_RULEBOOK.strategy.rr);
        expect(request.candidateRiskGrid).toEqual(
            candidateRiskGridOf(rungs[0]?.risk ?? 0),
        );
    });

    it('prices the candidate grid at the documented rung reward multiple, not the strategy rr, when the funded take profit differs', () => {
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                takeProfitCents: DEFAULT_RULEBOOK.funded.riskCents * 3,
            },
        };
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 252,
            rulebook,
            snapshotAsOf: '2026-09-26',
            today: '2026-09-26',
            trials: 20,
        });

        const request = readyRequestOf({
            ...valueRequestInputOf(),
            advice: advisor.assemble([]),
            rulebook,
        });

        expect(rulebook.strategy.rr).not.toBe(3);
        expect(request.rungs[0]?.rr).toBeCloseTo(3);
        expect(request.rr).toBeCloseTo(3);
    });

    it('carries a serializable start state and the full spec', () => {
        const request = readyRequestOf(valueRequestInputOf());

        expect(request.start.phase).toBe(TradingPhase.Funded);
        expect(structuredClone(request)).toEqual(request);
        expect(request.spec.rulebook).toEqual(DEFAULT_RULEBOOK);
    });

    it('asks for the payout stake only for an eligible account, with the reduced-risk what-if at half the documented funded risk', () => {
        const eligible = readyRequestOf({
            ...valueRequestInputOf(),
            advice: { ...valueRequestInputOf().advice, ...eligibleAdvice() },
        });
        const notEligible = readyRequestOf(valueRequestInputOf());

        expect(eligible.payoutStake).toEqual({
            reducedRiskDollars: DEFAULT_RULEBOOK.funded.riskCents / 100 / 2,
        });
        expect(notEligible.payoutStake).toBeNull();
    });

    it('values the payout the way the documented decision requests it: the personal request and the larger retained cushion', () => {
        const request = readyRequestOf({
            ...valueRequestInputOf(),
            personalPayoutOverride: dollars(750),
            personalRetainedCushion: dollars(3000),
        });

        expect(request.spec.enginePolicy.payoutRequestOverride).toBe(750);
        expect(request.spec.enginePolicy.retainedCushionRequest).toBe(3000);
    });

    it('keeps the rulebook cushion when the personal one is smaller, and no request override without a personal one', () => {
        const request = readyRequestOf({
            ...valueRequestInputOf(),
            personalRetainedCushion: dollars(100),
        });

        expect(request.spec.enginePolicy.payoutRequestOverride).toBeNull();
        expect(request.spec.enginePolicy.retainedCushionRequest).toBe(
            DEFAULT_RULEBOOK.payout.retainedCushionCents / 100,
        );
    });

    it('prices a payout stake whose requested amount is the personal request', () => {
        const request = readyRequestOf({
            ...valueRequestInputOf(),
            advice: { ...valueRequestInputOf().advice, ...eligibleAdvice() },
            personalPayoutOverride: dollars(750),
        });
        const cheap: AdvisorValueRequest = {
            ...request,
            spec: { ...request.spec, run: { ...request.spec.run, trials: 20 } },
        };

        const result = advisorValueOutcomeOf(plan, cheap);

        expect(result.payoutStake?.kind).toBe(
            AdvisorRequestOutcomeKind.Succeeded,
        );
        if (result.payoutStake?.kind !== AdvisorRequestOutcomeKind.Succeeded)
            return;
        const stake = result.payoutStake.value;
        if ('reason' in stake) throw new Error('expected a stake comparison');
        expect(stake.requestedAmount).toBe(750);
        expect(stake.reducedRiskWhatIf?.risk).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / 100 / 2,
        );
    });
});

describe('valueRunNoteOf (PT-67 review)', () => {
    it('states the run size, the seed, the horizon and an assumed zero rebuy lag as optimistic', () => {
        const request = readyRequestOf(valueRequestInputOf());

        const note = valueRunNoteOf(request);

        expect(note).toContain('1000 trials');
        expect(note).toContain('seed 42');
        expect(note).toContain('252-day funded horizon');
        expect(note).toContain('rebuy lag assumed zero (optimistic)');
    });

    it('states a measured rebuy lag with its sample count', () => {
        const request = readyRequestOf({
            ...valueRequestInputOf(),
            measuredRebuyLag: { days: 4, samples: 3 },
        });

        expect(valueRunNoteOf(request)).toContain(
            'rebuy lag measured at 4 days',
        );
    });
});

describe('adviceWithValues (PT-67 step 1)', () => {
    it('fills the daily card values from the first swing and appends the flat-risk reason', () => {
        const reason = {
            documentedFlatRisk: dollars(500),
            fromStateOptimum: dollars(250),
            gapInCombinedSEs: 3,
            kind: DifferenceReason.FlatRiskIgnoresState as const,
        };
        const advice = adviceFixture();

        const combined = adviceWithValues(advice, {
            firstSwing: swingResult(),
            flatRiskReason: reason,
            replacementFee: REPLACEMENT_FEE,
        });

        expect(combined.dailyPlanCard?.valueNow).toBe(1000);
        expect(combined.differenceReasons).toEqual([reason]);
        expect(advice.differenceReasons).toEqual([]);
    });

    it('returns the advice unchanged when there are no values', () => {
        const advice = adviceFixture();

        expect(
            adviceWithValues(advice, {
                firstSwing: null,
                flatRiskReason: null,
                replacementFee: REPLACEMENT_FEE,
            }),
        ).toEqual(advice);
    });
});

describe('adviceValueViewOf (PT-67 steps 1 and 2)', () => {
    const candidatesResult: RiskCandidateValuesResult = {
        basis: RiskCandidateBasis.Simulator,
        kind: ValueResultKind.Candidates,
        label: RISK_CANDIDATE_LABEL,
        rows: [
            {
                continuationValue: { standardError: 5, value: 1500 },
                monthlyNetCharge: 0,
                netOfDurationCharge: 1500,
                placement: {
                    contracts: null,
                    intendedRisk: 250,
                    placedRisk: 250,
                },
                swing: swingResult(),
            },
            {
                continuationValue: { standardError: 5, value: 900 },
                monthlyNetCharge: 0,
                netOfDurationCharge: 900,
                placement: {
                    contracts: null,
                    intendedRisk: 500,
                    placedRisk: 500,
                },
                swing: swingResult(),
            },
        ],
    };

    function outcomeOf(
        overrides: Partial<AdvisorValueResult> = {},
    ): AdvisorValueResult {
        return {
            candidates: succeeded(candidatesResult),
            now: succeeded(swingResult().now),
            payoutStake: null,
            swings: [
                {
                    outcome: succeeded(swingResult()),
                    rung: { risk: 500, rr: 2 },
                },
            ],
            ...overrides,
        };
    }

    it('has no sections without a worker outcome', () => {
        const view = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: null,
        });

        expect(view.swings).toEqual([]);
        expect(view.candidates).toBeNull();
        expect(view.tree).toBeNull();
        expect(view.firstSwing).toBeNull();
        expect(view.flatRiskReason).toBeNull();
        expect(view.stake).toBeNull();
    });

    it('builds the swing rows, the tree of the first rung, the ranked candidates and the flat-risk reason', () => {
        const view = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf(),
        });

        expect(view.swings).toHaveLength(1);
        expect(view.tree?.valueNow.value).toBe(1000);
        expect(view.firstSwing?.winProbability).toBe(0.4);
        expect(view.candidates?.kind).toBe(ValueSectionKind.Ready);
        expect(view.flatRiskReason?.kind).toBe(
            DifferenceReason.FlatRiskIgnoresState,
        );
    });

    it('states a failed candidates computation and a failed payout stake instead of hiding them', () => {
        const failure = {
            kind: AdvisorRequestOutcomeKind.Failed as const,
            reason: 'refused',
        };

        const view = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf({ candidates: failure, payoutStake: failure }),
        });

        expect(view.candidates).toEqual({
            kind: ValueSectionKind.Failed,
            reason: 'refused',
        });
        expect(view.stake).toEqual({
            kind: ValueSectionKind.Failed,
            reason: 'refused',
        });
        expect(view.flatRiskReason).toBeNull();
    });

    it('leaves the engine message of a failed eval swing and candidates untouched', () => {
        const failure = {
            kind: AdvisorRequestOutcomeKind.Failed as const,
            reason: 'the engine refused this start',
        };

        const view = adviceValueViewOf({
            context: EVAL_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf({
                candidates: failure,
                swings: [{ outcome: failure, rung: { risk: 500, rr: 2 } }],
            }),
        });

        expect(view.candidates).toEqual({
            kind: ValueSectionKind.Failed,
            reason: 'the engine refused this start',
        });
        expect(view.swings[0]).toMatchObject({
            kind: ValueSectionKind.Failed,
            reason: 'the engine refused this start',
        });
    });

    it('states the session boundary the swing is valued at, once, for any account kind', () => {
        const swing = {
            outcome: succeeded(swingResult()),
            rung: { risk: 500, rr: 2 },
        };
        const oneRung = adviceValueViewOf({
            context: EVAL_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf({ swings: [swing] }),
        });

        expect(oneRung.boundaryNote).toBe(
            `Assumption: ${TRADE_VALUE_SWING_ASSUMPTION}.`,
        );
    });

    it('adds that the rest of today rungs are not in the after-loss value when the documented rule keeps trading after a loss', () => {
        const first = {
            outcome: succeeded(swingResult()),
            rung: { risk: 500, rr: 2 },
        };
        const second = {
            outcome: succeeded(swingResult()),
            rung: { risk: 750, rr: 2 },
        };
        const twoRungs = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf({ swings: [first, second] }),
        });

        expect(twoRungs.boundaryNote).toBe(
            `Assumption: ${TRADE_VALUE_SWING_ASSUMPTION}. ${SESSION_BOUNDARY_CONTINUES_TEXT}`,
        );
        expect(SESSION_BOUNDARY_CONTINUES_TEXT).toContain(
            "the rest of today's rungs are not in the after-loss value",
        );
        expect(SESSION_BOUNDARY_CONTINUES_TEXT).toContain(
            'Each later rung is priced as reached after the earlier rungs lost',
        );
    });

    it('has no boundary note when no swing was valued', () => {
        const none = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: null,
        });
        const failed = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf({ swings: [failedSwing('refused')] }),
        });

        expect(none.boundaryNote).toBeNull();
        expect(failed.boundaryNote).toBeNull();
    });

    it('does not name a flat-risk reason for an eval, where the documented rung is the maximum and the grid only reaches lower', () => {
        const funded = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf(),
        });
        const evalView = adviceValueViewOf({
            context: EVAL_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf(),
        });

        expect(funded.flatRiskReason).not.toBeNull();
        expect(evalView.flatRiskReason).toBeNull();
    });

    it('carries the replacement fee for the daily card and the tree', () => {
        const view = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf(),
        });

        expect(view.replacementFee).toBe(REPLACEMENT_FEE);
    });

    it('has no tree when the first swing failed', () => {
        const failure = {
            kind: AdvisorRequestOutcomeKind.Failed as const,
            reason: 'refused',
        };

        const view = adviceValueViewOf({
            context: FUNDED_CONTEXT,
            documentedRisk: 500,
            outcome: outcomeOf({
                swings: [{ outcome: failure, rung: { risk: 500, rr: 2 } }],
            }),
        });

        expect(view.tree).toBeNull();
        expect(view.firstSwing).toBeNull();
        expect(view.swings[0]?.kind).toBe(ValueSectionKind.Failed);
    });
});

describe('parseRiskCheckInputs (PT-67 step 3)', () => {
    it('is Empty while no risk is entered', () => {
        expect(
            parseRiskCheckInputs({ losses: '', risk: '', wins: '' }).kind,
        ).toBe(RiskCheckInputKind.Empty);
        expect(
            parseRiskCheckInputs({
                losses: '2',
                risk: ' '.repeat(3),
                wins: '1',
            }).kind,
        ).toBe(RiskCheckInputKind.Empty);
    });

    it('reads a risk in whole cents and blank wins and losses as zero', () => {
        const parsed = parseRiskCheckInputs({
            losses: '',
            risk: '250.50',
            wins: '',
        });

        expect(parsed).toEqual({
            kind: RiskCheckInputKind.Valid,
            losses: 0,
            risk: 250.5,
            wins: 0,
        });
    });

    it.each([
        ['a sub-cent risk that would floor to zero', '0.004'],
        [
            'a risk with more than two decimals, which would floor in the permissive direction',
            '500.009',
        ],
        ['a risk in exponent form', '1e3'],
    ])(
        'is Invalid for %s, never a within-plan check at a different risk',
        (_name, risk) => {
            const parsed = parseRiskCheckInputs({ losses: '', risk, wins: '' });

            expect(parsed.kind).toBe(RiskCheckInputKind.Invalid);
        },
    );

    it('reads whole wins and losses', () => {
        expect(
            parseRiskCheckInputs({ losses: '2', risk: '100', wins: '1' }),
        ).toEqual({
            kind: RiskCheckInputKind.Valid,
            losses: 2,
            risk: 100,
            wins: 1,
        });
    });

    it.each([
        ['a risk of zero', { losses: '', risk: '0', wins: '' }],
        ['a negative risk', { losses: '', risk: '-5', wins: '' }],
        ['a risk that is not a number', { losses: '', risk: 'abc', wins: '' }],
        ['a fractional loss count', { losses: '1.5', risk: '100', wins: '' }],
        ['a negative win count', { losses: '', risk: '100', wins: '-1' }],
        ['an absurd loss count', { losses: '1000', risk: '100', wins: '' }],
    ])('is Invalid with a stated message for %s', (_name, inputs) => {
        const parsed = parseRiskCheckInputs(inputs);

        expect(parsed.kind).toBe(RiskCheckInputKind.Invalid);
        if (parsed.kind !== RiskCheckInputKind.Invalid) return;
        expect(parsed.message.length).toBeGreaterThan(0);
    });
});

describe('riskCheckViewOf (PT-67 step 3)', () => {
    it('says within plan and never offers a violation log, even after a loss (the ladder step up is not a violation)', () => {
        const view = riskCheckViewOf(checkResult(), 2);

        expect(view.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(view.verdictText).toBe('Within your documented plan.');
        expect(view.isViolationOffered).toBe(false);
        expect(view.excess).toBe(0);
    });

    it('states the excess over the documented rung in dollars and offers the log after a loss', () => {
        const view = riskCheckViewOf(
            checkResult({
                excessCents: 12_550,
                verdict: NextTradeRiskVerdict.AboveDocumented,
            }),
            1,
        );

        expect(view.excess).toBe(125.5);
        expect(view.verdictText).toBe(
            `Above the documented rung of ${formatCurrency(250, 2)} by ${formatCurrency(125.5, 2)}.`,
        );
        expect(view.isViolationOffered).toBe(true);
    });

    it('does not offer the log for an above-rung risk before any loss', () => {
        const view = riskCheckViewOf(
            checkResult({
                excessCents: 5000,
                verdict: NextTradeRiskVerdict.AboveDocumented,
            }),
            0,
        );

        expect(view.isViolationOffered).toBe(false);
    });

    it('says the day has stopped, with the reason, when there is no documented rung left', () => {
        const view = riskCheckViewOf(
            checkResult({
                documentedRung: null,
                excessCents: 10_000,
                stopReason: DayStopReason.NoLossRoom,
                verdict: NextTradeRiskVerdict.AboveDocumented,
            }),
            2,
        );

        expect(view.verdictText).toContain('has stopped for today');
        expect(view.stopText).not.toBeNull();
        expect(view.isViolationOffered).toBe(true);
    });

    it('carries the payout-eligible flag for the banner', () => {
        const view = riskCheckViewOf(
            checkResult({
                excessCents: 5000,
                payoutEligibleAboveRung: true,
                verdict: NextTradeRiskVerdict.AboveDocumented,
            }),
            0,
        );

        expect(view.payoutEligibleAboveRung).toBe(true);
    });

    it('describes a risk above the engine suggestion but within the rung', () => {
        const view = riskCheckViewOf(
            checkResult({
                dpRisk: dollars(100),
                excessCents: 5000,
                verdict: NextTradeRiskVerdict.AboveDp,
            }),
            0,
        );

        expect(view.verdictText).toContain('above the engine');
        expect(view.isViolationOffered).toBe(false);
    });
});

describe('todaysDecisionsOf (PT-67 step 3)', () => {
    const decisions = [
        { actualRiskCents: null, decidedOn: '2026-09-27', id: 'd3' },
        { actualRiskCents: 25_000, decidedOn: '2026-09-27', id: 'd2' },
        { actualRiskCents: 10_000, decidedOn: '2026-09-26', id: 'd1' },
    ];

    it('picks the latest decision of today and the latest of today with a recorded actual', () => {
        expect(todaysDecisionsOf(decisions, '2026-09-27')).toEqual({
            latest: decisions[0],
            recorded: decisions[1],
        });
    });

    it('has neither when no decision was made today', () => {
        expect(todaysDecisionsOf(decisions, '2026-09-28')).toEqual({
            latest: null,
            recorded: null,
        });
    });
});

describe('riskChecksOf (PT-67 step 3 and review)', () => {
    const advisor = fundedAdvisor();
    const rungs = advisor.dailyPlanCard()?.rungs ?? [];
    const firstRung = rungs[0]?.risk ?? 0;

    it('links the recorded block to the decision that holds the recorded actual risk, not the latest decision of the day', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [decision('latest', null), decision('recorded', 900)],
            inputs: EMPTY_RISK_CHECK_INPUTS,
            today: '2026-09-27',
        });

        expect(checks.recorded?.decisionId).toBe('recorded');
        expect(checks.recorded?.risk).toBe(900);
        expect(checks.recorded?.view.verdict).toBe(
            NextTradeRiskVerdict.AboveDocumented,
        );
    });

    it('has no recorded check without a recorded actual risk today', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [
                decision('latest', null),
                decision('old', 900, '2026-09-26'),
            ],
            inputs: EMPTY_RISK_CHECK_INPUTS,
            today: '2026-09-27',
        });

        expect(checks.recorded).toBeNull();
    });

    it('says the recorded risk was judged as the first trade of the day while no wins or losses are entered', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [decision('recorded', firstRung)],
            inputs: EMPTY_RISK_CHECK_INPUTS,
            today: '2026-09-27',
        });

        expect(checks.recorded?.basisText).toBe(
            'Judged as the first trade of the day: no wins or losses are entered above.',
        );
        expect(checks.recorded?.view.verdict).toBe(
            NextTradeRiskVerdict.WithinPlan,
        );
    });

    it('says which wins and losses the recorded risk was judged against once they are entered, and judges it by the entered progress', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [decision('recorded', firstRung)],
            inputs: { losses: '1', risk: '', wins: '0' },
            today: '2026-09-27',
        });

        expect(checks.recorded?.basisText).toBe(
            'Judged against 0 wins and 1 loss entered above.',
        );
    });

    it('says the entered counts are not valid when they cannot be read', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [decision('recorded', firstRung)],
            inputs: { losses: 'x', risk: '', wins: '' },
            today: '2026-09-27',
        });

        expect(checks.recorded?.basisText).toBe(
            'Judged as the first trade of the day: the wins and losses entered above are not valid.',
        );
    });

    it('checks a proposed risk against the entered day and names the stop once the day has stopped', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [],
            inputs: { losses: '50', risk: '100', wins: '0' },
            today: '2026-09-27',
        });

        expect(checks.parsedRisk.kind).toBe(RiskCheckInputKind.Valid);
        expect(checks.proposed?.verdict).toBe(
            NextTradeRiskVerdict.AboveDocumented,
        );
        expect(checks.stopReason).not.toBeNull();
    });

    it('has no proposed check and no stop while nothing is entered', () => {
        const checks = riskChecksOf({
            advisor,
            decisions: [],
            inputs: EMPTY_RISK_CHECK_INPUTS,
            today: '2026-09-27',
        });

        expect(checks.proposed).toBeNull();
        expect(checks.stopReason).toBeNull();
        expect(checks.flagExcess).toBe(0);
    });

    it('takes the larger payout-eligible excess of the proposed and recorded checks as the banner flag', () => {
        expect(
            payoutFlagExcessOf([flagViewOf(40, true), flagViewOf(90, true)]),
        ).toBe(90);
        expect(payoutFlagExcessOf([flagViewOf(40, false), null])).toBe(0);
        expect(payoutFlagExcessOf([])).toBe(0);
    });
});

describe('contractsSizingOf (PT-67 step 4)', () => {
    const base = {
        instrument: InstrumentSymbol.NQ,
        phase: TradingPhase.Funded,
        plan,
        risk: 450,
        stopPoints: null,
        tierContext: null,
        unit: RiskDisplayUnit.AccountDollars,
    };

    it('links to the position size page with the risk, plan, phase and instrument prefilled through its URL codec', () => {
        const { href } = contractsSizingOf(base);

        const decoded = decodePositionSize(queryOf(href));
        expect(decoded.risk).toBe(450);
        expect(decoded.plan.id).toEqual(plan.id);
        expect(decoded.instrument).toBe(InstrumentSymbol.NQ);
        expect(decoded.phase).toBe(TradingPhase.Funded);
        expect(decoded.unit).toBe(RiskDisplayUnit.AccountDollars);
    });

    it('leaves the stop out of the link and shows nothing inline until a stop is entered', () => {
        const sizing = contractsSizingOf(base);

        expect(queryOf(sizing.href).has(PositionSizeUrlParameter.Stop)).toBe(
            false,
        );
        expect(sizing.inline).toBeNull();
    });

    it('shows the whole contracts for the risk at the entered stop inline and puts the stop in the link', () => {
        const sizing = contractsSizingOf({
            ...base,
            risk: 150,
            stopPoints: 7.5,
        });

        const decoded = decodePositionSize(queryOf(sizing.href));
        const expected = positionSizeFor({
            ...decoded,
            stopPoints: points(7.5),
        });

        expect(sizing.inline?.contracts).toBe(expected.contracts);
        expect(sizing.inline?.contracts).toBe(1);
        expect(sizing.inline?.statusText).toContain('1 NQ');
        expect(queryOf(sizing.href).get(PositionSizeUrlParameter.Stop)).toBe(
            '7.5',
        );
    });

    it('floors to whole contracts, never rounding the risk up', () => {
        const sizing = contractsSizingOf({
            ...base,
            risk: 449,
            stopPoints: 7.5,
        });

        expect(sizing.inline?.contracts).toBe(2);
    });

    it('names the risk of the same count on the sibling instrument, with its severity when it passes the planned risk', () => {
        const sizing = contractsSizingOf({
            ...base,
            instrument: InstrumentSymbol.MNQ,
            risk: 150,
            stopPoints: 7.5,
        });

        expect(sizing.inline?.siblingText).toContain('NQ would risk');
        expect(sizing.inline?.siblingSeverityText).not.toBeNull();
    });

    it('has no sibling line for an instrument with no sibling', () => {
        const sizing = contractsSizingOf({
            ...base,
            instrument: InstrumentSymbol.ES,
            risk: 150,
            stopPoints: 3,
        });

        expect(sizing.inline?.siblingText ?? null).toBeNull();
        expect(sizing.inline?.siblingSeverityText ?? null).toBeNull();
    });

    describe('on a funded account that has scaled up', () => {
        const tieredPlan = (() => {
            const found = ALL_FIRMS.flatMap((firm) => firm.plans).find(
                (candidate) =>
                    !candidate.isInstantFunded &&
                    Object.values(TierBasis).flatMap((basis) =>
                        candidate.fundedContractTierBreakpoints(basis, false),
                    ).length > 1,
            );
            if (found === undefined) throw new Error('no tiered plan');
            return found;
        })();
        const [, secondTier] = fundedTierOptions(
            tieredPlan,
            InstrumentSymbol.NQ,
        );

        function scaledContext(profit: number) {
            const state = tieredPlan.initialState();
            const scaled = {
                ...state,
                balance: state.balance + profit,
                peakDayCloseProfit: profit,
                peakIntradayProfit: profit,
            };
            return tieredPlan.tierProfitContext(scaled);
        }

        it('caps the contracts at the tier the account stands on, not at the starting tier', () => {
            const context = scaledContext(secondTier ?? 0);
            const scaledCap = contractLimitAt(
                tieredPlan.contractLimits,
                TradingPhase.Funded,
                false,
                context,
            );
            const startCap = contractLimitAt(
                tieredPlan.contractLimits,
                TradingPhase.Funded,
                false,
                tieredPlan.tierProfitContext(tieredPlan.initialState()),
            );
            expect(scaledCap).not.toBeNull();
            expect(scaledCap ?? 0).toBeGreaterThan(startCap ?? 0);
            const wide = {
                ...base,
                phase: TradingPhase.Funded,
                plan: tieredPlan,
                risk: 1_000_000,
                stopPoints: 1,
            };

            const atStart = contractsSizingOf({ ...wide, tierContext: null });
            const scaled = contractsSizingOf({ ...wide, tierContext: context });

            expect(atStart.inline?.contracts).toBe(startCap);
            expect(scaled.inline?.contracts).toBe(scaledCap);
            expect(
                queryOf(scaled.href).has(PositionSizeUrlParameter.Tier),
            ).toBe(true);
        });

        it('leaves the starting tier alone for an account that has not scaled', () => {
            const sizing = contractsSizingOf({
                ...base,
                phase: TradingPhase.Funded,
                plan: tieredPlan,
                risk: 1_000_000,
                stopPoints: 1,
                tierContext: tieredPlan.tierProfitContext(
                    tieredPlan.initialState(),
                ),
            });

            expect(
                queryOf(sizing.href).has(PositionSizeUrlParameter.Tier),
            ).toBe(false);
        });

        it('ignores the tier for an eval account', () => {
            const sizing = contractsSizingOf({
                ...base,
                phase: TradingPhase.Eval,
                plan: tieredPlan,
                tierContext: scaledContext(secondTier ?? 0),
            });

            expect(
                queryOf(sizing.href).has(PositionSizeUrlParameter.Tier),
            ).toBe(false);
        });
    });

    it.each([0, -1, NaN])(
        'shows nothing inline for an unusable stop of %s',
        (stopPoints) => {
            expect(
                contractsSizingOf({ ...base, stopPoints }).inline,
            ).toBeNull();
        },
    );
});

describe('dayStopReasonOf (PT-67 step 4)', () => {
    it('is null at the start of a day with a rung, and names a reason once the day has stopped', () => {
        const advisor = fundedAdvisor();
        expect(advisor.dailyPlanCard()?.rungs.length).toBeGreaterThan(0);

        expect(dayStopReasonOf(advisor, 0, 0)).toBeNull();
        expect(dayStopReasonOf(advisor, 0, 50)).not.toBeNull();
    });
});

describe('parseDayCounts (PT-67 step 4)', () => {
    it('reads the wins and losses of the day with blanks as zero, with no risk entered', () => {
        expect(parseDayCounts({ losses: '2', risk: '', wins: '' })).toEqual({
            losses: 2,
            wins: 0,
        });
        expect(parseDayCounts(EMPTY_RISK_CHECK_INPUTS)).toEqual({
            losses: 0,
            wins: 0,
        });
    });

    it('is null when a count is not a whole number in range', () => {
        expect(
            parseDayCounts({ losses: '1.5', risk: '', wins: '' }),
        ).toBeNull();
        expect(parseDayCounts({ losses: '', risk: '', wins: '-1' })).toBeNull();
        expect(
            parseDayCounts({ losses: '1000', risk: '', wins: '' }),
        ).toBeNull();
    });
});

describe('ACCOUNT_ACTION_TEXT', () => {
    it('has a stated text for every account action', () => {
        for (const action of Object.values(AccountAction)) {
            expect(ACCOUNT_ACTION_TEXT[action].length).toBeGreaterThan(0);
        }
    });
});
