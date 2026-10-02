import { type ArgsDef, defineCommand } from 'citty';
import { z } from 'zod';

import {
    commissionArgument,
    formatCurrencyWithSe,
    formatNumberWithSe,
    formatPercentWithSe,
    monteCarloArguments,
    planArguments,
    planResolver,
    readNonNegativeInteger,
    readNonNegativeNumber,
    readPositiveInteger,
    readPositiveNumber,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type AccountStage,
    describeLifecycleRejection,
    describePlanOptIn,
    isAccountDate,
    offeredPlanOptIns,
    PlanOptIn,
    todayIsoDate,
    validateStageForPlan,
} from '~/lib/prop-accounts/core';
import {
    missingSnapshotFields,
    SnapshotField,
    SnapshotFieldRequirement,
    snapshotFieldRules,
} from '~/lib/prop-accounts/snapshots';
import {
    ALL_FIRMS,
    dollars,
    type Dollars,
    findFirm,
    type FirmId,
    type InstrumentSymbol,
    type Plan,
    points,
    rankablePlans,
    TRADING_DAYS_PER_YEAR,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    accountSnapshotInputSchema,
    AccountSubstate,
    type Advice,
    type AdviceProvenance,
    AdviceSource,
    AdviceStalenessReason,
    assertPlausibleSnapshot,
    assumptionText,
    buildEnginePolicy,
    createSizingAdvisor,
    DailyProfitCapKind,
    DashboardBalanceConvention,
    DAY_STOP_REASON_TEXT,
    type DayProgress,
    DEFAULT_MAX_EVAL_DAYS,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    type DocumentedSizing,
    type EngineOptimumRequest,
    type EngineOptimumRunnerResult,
    EvalSizingMode,
    FundedFromStateOptimumResultKind,
    type FundedSweepOptimumResult,
    FundedSweepOptimumResultKind,
    ImplausibleSnapshotError,
    type LadderEngineOptimumResult,
    LadderEngineOptimumResultKind,
    LadderFractionSource,
    ladderRefusalText,
    type LadderSearchRequest,
    liveTriggerCountText,
    NEXT_PAYOUT_AMONG_PAYING_TEXT,
    NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
    NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
    nextPayoutEvidenceText,
    type NextPayoutProjection,
    NextPayoutTimingKind,
    nextPayoutTimingOf,
    type PayoutAdvice,
    type PayoutBlockReason,
    PayoutBlockReasonKind,
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
    type PayoutSizeSweepResult,
    PayoutSizeSweepResultKind,
    type PayoutSizeSweepRow,
    type PayoutWait,
    PayoutWaitBasis,
    type PersonalPayoutOverrideResult,
    personalPayoutOverrideWarningText,
    type ReconstructedAccount,
    type RulebookParameters,
    rulebookSchema,
    runEngineOptimum,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    type SizingAdvisor,
    type SizingAdvisorCreateOptions,
    SizingAssumption,
    sizingObjectiveText,
    SizingStage,
    SnapshotInputField,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    adviceCoverageOf,
    AdviceCoverageOutcomeKind,
    AdviceCoverageUnsupportedReason,
    dayProgressFromCounts,
    type NextTradeRiskCheckResult,
} from '~/lib/prop-calculator/advisor/actions';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from '~/lib/prop-calculator/advisor/policy';
import {
    CreditBasis,
    netOfReplacementFee,
    tradeValueSwing,
    type TradeValueSwingOutcome,
    valueGap,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export enum NextTradeRiskReportKind {
    Checked = 'checked',
    NotRun = 'not-run',
}

export interface AdviseArguments {
    'allow-below-hard-rule-2'?: boolean;
    balance?: string;
    commission: string;
    'cumulative-payout'?: string;
    'cycle-best-day'?: string;
    'dashboard-convention': string;
    'dashboard-floor'?: string;
    'early-withdrawal'?: boolean;
    'eval-best-day'?: string;
    'eval-mode': string;
    firm?: FirmId;
    'first-funded-trade-date'?: string;
    'floor-at-last-payout'?: string;
    'funded-reset'?: boolean;
    'funded-resets-used'?: string;
    'highest-eod'?: string;
    'highest-intraday'?: string;
    instrument: InstrumentSymbol;
    json?: boolean;
    'ladder-fractions': string;
    'last-payout-balance'?: string;
    'last-payout-date'?: string;
    'last-traded-date'?: string;
    'live-start-balance'?: string;
    'losses-today'?: string;
    matrix?: boolean;
    payouts?: string;
    'proposed-risk'?: string;
    'qualifying-days'?: string;
    'rebuy-lag-days'?: string;
    'request-size'?: string;
    'retain-cushion'?: string;
    risk?: string;
    rr: string;
    seed: string;
    'snapshot-date'?: string;
    stage?: string;
    'stop-points'?: string;
    suspended?: boolean;
    tpd: string;
    'trading-days'?: string;
    trials: string;
    variant?: string;
    winrate: string;
    'wins-today'?: string;
}

export interface AdviseInputs {
    readonly options: SizingAdvisorCreateOptions;
    readonly plan: Plan;
    readonly snapshot: AccountSnapshotInput;
    readonly stage: SizingStage;
}

const MONEY_FLAG_LABEL: Record<string, string> = {
    balance: 'balance',
    'cumulative-payout': 'cumulative payout',
    'cycle-best-day': 'best day profit this payout cycle',
    'dashboard-floor': 'dashboard floor',
    'eval-best-day': 'best day profit in the evaluation',
    'floor-at-last-payout': 'floor at the last payout',
    'highest-eod': 'highest end-of-day balance',
    'highest-intraday': 'highest intraday balance',
    'last-payout-balance': 'balance at the last payout',
    'live-start-balance': 'live start balance',
};

const SNAPSHOT_FIELD_FLAG: Readonly<Record<SnapshotField, string>> = {
    [SnapshotField.AsOf]: 'snapshot-date',
    [SnapshotField.Balance]: 'balance',
    [SnapshotField.BalanceAtLastPayout]: 'last-payout-balance',
    [SnapshotField.CumulativePayout]: 'cumulative-payout',
    [SnapshotField.CycleBestDayProfit]: 'cycle-best-day',
    [SnapshotField.DashboardFloor]: 'dashboard-floor',
    [SnapshotField.EvalBestDayProfit]: 'eval-best-day',
    [SnapshotField.FloorAtLastPayout]: 'floor-at-last-payout',
    [SnapshotField.HighestEodBalance]: 'highest-eod',
    [SnapshotField.HighestIntradayBalance]: 'highest-intraday',
    [SnapshotField.LastPayoutOn]: 'last-payout-date',
    [SnapshotField.LastTradedOn]: 'last-traded-date',
    [SnapshotField.PayoutsTaken]: 'payouts',
    [SnapshotField.QualifyingDaysSinceLastPayout]: 'qualifying-days',
    [SnapshotField.TradingDays]: 'trading-days',
};

const PLAUSIBILITY_FIELD_FLAG: Readonly<Record<SnapshotInputField, string>> = {
    [SnapshotInputField.AsOf]: 'snapshot-date',
    [SnapshotInputField.Balance]: 'balance',
    [SnapshotInputField.BalanceAtLastPayout]: 'last-payout-balance',
    [SnapshotInputField.CumulativePayout]: 'cumulative-payout',
    [SnapshotInputField.CycleBestDayProfit]: 'cycle-best-day',
    [SnapshotInputField.DashboardConvention]: 'dashboard-convention',
    [SnapshotInputField.DashboardFloor]: 'dashboard-floor',
    [SnapshotInputField.ElapsedDaysSinceAttemptStart]:
        'elapsedDaysSinceAttemptStart',
    [SnapshotInputField.EvalBestDayProfit]: 'eval-best-day',
    [SnapshotInputField.FirstFundedTradeOn]: 'first-funded-trade-date',
    [SnapshotInputField.FloorAtLastPayout]: 'floor-at-last-payout',
    [SnapshotInputField.FundedOn]: 'fundedOn',
    [SnapshotInputField.FundedResetsUsed]: 'funded-resets-used',
    [SnapshotInputField.HighestEodBalance]: 'highest-eod',
    [SnapshotInputField.HighestIntradayBalance]: 'highest-intraday',
    [SnapshotInputField.LastPayoutOn]: 'last-payout-date',
    [SnapshotInputField.LastTradedOn]: 'last-traded-date',
    [SnapshotInputField.LiveStartBalance]: 'live-start-balance',
    [SnapshotInputField.PayoutsTaken]: 'payouts',
    [SnapshotInputField.PendingPayouts]: 'pendingPayouts',
    [SnapshotInputField.PurchasedOn]: 'purchasedOn',
    [SnapshotInputField.QualifyingDaysSinceLastPayout]: 'qualifying-days',
    [SnapshotInputField.Stage]: 'stage',
    [SnapshotInputField.TradingDays]: 'trading-days',
};

export const adviseArguments = {
    ...planArguments,
    ...monteCarloArguments,
    ...commissionArgument,
    'allow-below-hard-rule-2': {
        default: false,
        description:
            'Allow a --retain-cushion below the $2,000 Hard Rule 2 floor',
        type: 'boolean',
    },
    balance: {
        description: "Current balance, in this account's dashboard convention",
        type: 'string',
    },
    'cumulative-payout': {
        description:
            'What you were paid, after the profit split, not the gross amount debited',
        type: 'string',
    },
    'cycle-best-day': {
        description: 'Best day profit this payout cycle, for consistency rules',
        type: 'string',
    },
    'dashboard-convention': {
        default: DashboardBalanceConvention.Nominal,
        description: 'How the dashboard shows the balance',
        options: Object.values(DashboardBalanceConvention),
        type: 'enum',
    },
    'dashboard-floor': {
        description:
            'The max loss level the firm dashboard shows. When entered, it decides the floor instead of the reconstructed peak',
        type: 'string',
    },
    'early-withdrawal': {
        default: false,
        description:
            'Take the one-time early withdrawal on plans that offer it',
        type: 'boolean',
    },
    'eval-best-day': {
        description: 'Best day profit in the evaluation, for consistency rules',
        type: 'string',
    },
    'eval-mode': {
        default: DEFAULT_RULEBOOK.eval.mode,
        description:
            'How the evaluation is sized: a risk ladder or flat max risk',
        options: Object.values(EvalSizingMode),
        type: 'enum',
    },
    'first-funded-trade-date': {
        description: 'Date of the first funded trade (YYYY-MM-DD)',
        type: 'string',
    },
    'floor-at-last-payout': {
        description:
            'Where the floor locked at the last payout, if it locks on payout',
        type: 'string',
    },
    'funded-reset': {
        default: false,
        description:
            'This account took the funded reset on plans that offer it',
        type: 'boolean',
    },
    'funded-resets-used': {
        description: 'Funded resets already used on this account',
        type: 'string',
    },
    'highest-eod': {
        description: 'The highest end-of-day balance so far',
        type: 'string',
    },
    'highest-intraday': {
        description:
            'The highest balance reached during any session, including open profit',
        type: 'string',
    },
    json: {
        default: false,
        description: 'Print only the JSON advice, no headings or spinner',
        type: 'boolean',
    },
    'ladder-fractions': {
        default: DEFAULT_RULEBOOK.eval.ladderFractionSource,
        description: 'Which derivation the eval ladder fractions come from',
        options: Object.values(LadderFractionSource),
        type: 'enum',
    },
    'last-payout-balance': {
        description: 'Balance at the last payout',
        type: 'string',
    },
    'last-payout-date': {
        description: 'Date of the last payout (YYYY-MM-DD)',
        type: 'string',
    },
    'last-traded-date': {
        description: 'Date this account last traded (YYYY-MM-DD)',
        type: 'string',
    },
    'live-start-balance': {
        description: 'Balance the live account started at',
        type: 'string',
    },
    'losses-today': {
        description:
            'Losing trades already closed today, for the next-trade risk check against --proposed-risk',
        type: 'string',
    },
    matrix: {
        default: false,
        description:
            "Print PT-74's coverage matrix instead of advice: every rankable plan (--firm, or every firm when omitted) at every stage and every AccountSubstate, from a synthetic snapshot, printed as advice (its headline) or a typed unsupported reason. Ignores every snapshot flag",
        type: 'boolean',
    },
    payouts: {
        description: 'Payouts taken so far on this account',
        type: 'string',
    },
    'proposed-risk': {
        description:
            'Check this risk amount for the next trade against the documented rung and --wins-today/--losses-today, printing the verdict and the excess',
        type: 'string',
    },
    'qualifying-days': {
        description: 'Qualifying days since the last payout',
        type: 'string',
    },
    'rebuy-lag-days': {
        description:
            'Measured days an account slot sits empty for every eval attempt. Omit to assume 0 (RebuyLagAssumed)',
        type: 'string',
    },
    'request-size': {
        description:
            'Personal payout-request override, in account currency. Omit to use the rulebook default',
        type: 'string',
    },
    'retain-cushion': {
        description:
            "Personal minimum cushion to leave on payout, never below the plan's floor or the $2,000 Hard Rule 2 default (pass --allow-below-hard-rule-2 to go lower). Omit to use the rulebook default",
        type: 'string',
    },
    risk: {
        description:
            "Print the EV swing of one trade at this risk, at --rr. A --rr that differs from the documented rule's own reward multiple prints a what-if label, never the headline",
        type: 'string',
    },
    'snapshot-date': {
        description:
            "The snapshot's as-of date (YYYY-MM-DD). Defaults to today",
        type: 'string',
    },
    stage: {
        description: `Account stage: ${Object.values(SizingStage).join(', ')}`,
        options: Object.values(SizingStage),
        type: 'enum',
    },
    suspended: {
        default: false,
        description:
            'The firm has suspended this account: no sizing, daily plan, payout advice or risk check is given, only the reason',
        type: 'boolean',
    },
    tpd: {
        default: '4',
        description: 'Trades per day when using flat risk',
        type: 'string',
    },
    'trading-days': {
        description: 'Trading days so far this stage',
        type: 'string',
    },
    'wins-today': {
        description:
            'Winning trades already closed today, for the next-trade risk check against --proposed-risk',
        type: 'string',
    },
} satisfies ArgsDef;

export interface CheckedNextTradeRiskReport {
    readonly day: DayProgress;
    readonly kind: NextTradeRiskReportKind.Checked;
    readonly proposedRisk: Dollars;
    readonly result: NextTradeRiskCheckResult;
}

export interface NextTradeRiskInputs {
    readonly losses: number;
    readonly proposedRisk: Dollars;
    readonly wins: number;
}

export type NextTradeRiskReport =
    CheckedNextTradeRiskReport | NotRunNextTradeRiskReport;

export interface NotRunNextTradeRiskReport {
    readonly day: DayProgress;
    readonly kind: NextTradeRiskReportKind.NotRun;
    readonly proposedRisk: Dollars;
    readonly reason: string;
}

export function adviceJson(
    advice: Advice,
    riskCheck: NextTradeRiskReport | null = null,
): string {
    return JSON.stringify(
        riskCheck === null
            ? advice
            : { ...advice, nextTradeRiskCheck: riskCheck },
        null,
        2,
    );
}

export function adviceReportLines(
    advice: Advice,
    enteredStopPoints: null | number = null,
): string[] {
    const lines: string[] = [advice.headline];
    if (advice.staleness.kind === 'stale') {
        return [
            ...lines,
            `Stale as of ${advice.staleness.snapshotAsOf} (${staleReasonWords(advice.staleness.reasons)}): ${staleRemedy(advice.staleness.reasons)}.`,
            provenanceLine(advice.provenance),
        ];
    }
    if (advice.documented !== null) {
        lines.push(
            ...documentedSizingLines(advice.documented, enteredStopPoints),
        );
    }
    if (advice.payoutAdvice !== null) {
        lines.push(...payoutAdviceLines(advice.payoutAdvice));
    }
    lines.push(...engineOptimaLines(advice.optima, advice.requests));
    for (const reason of advice.differenceReasons) {
        lines.push(differenceReasonText(reason));
    }
    for (const assumption of advice.assumptions) {
        lines.push(assumptionText(assumption));
    }
    lines.push(provenanceLine(advice.provenance));
    return lines;
}

export function coverageMatrixLines(firmId: FirmId | undefined): string[] {
    const firms = firmId === undefined ? ALL_FIRMS : [requireFirm(firmId)];
    const today = todayIsoDate(new Date());
    return firms.flatMap((firm) => [
        `-- ${firm.id} --`,
        ...rankablePlans(firm.plans, true).flatMap((plan) =>
            Object.values(SizingStage).flatMap((stage) =>
                stage === SizingStage.Eval && plan.isInstantFunded
                    ? [
                          coverageLineFor(
                              plan,
                              stage,
                              AccountSubstate.Fresh,
                              today,
                          ),
                      ]
                    : Object.values(AccountSubstate).map((substate) =>
                          coverageLineFor(plan, stage, substate, today),
                      ),
            ),
        ),
    ]);
}

export function engineResultsFor(
    advisor: SizingAdvisor,
    plan: Plan,
): EngineOptimumRunnerResult[] {
    return advisor.staleness().kind === 'stale'
        ? []
        : advisor
              .optimumRequests()
              .map((request) => runEngineOptimum(plan, request));
}

export default defineCommand({
    args: adviseArguments,
    meta: {
        description:
            'Advise sizing for one reconstructed account (--firm, --variant, --stage) from a snapshot: eval ladder, funded flat risk, or live percent of cushion',
        name: 'advise',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            if (context.args.matrix) {
                rejectRiskFlagsWithMatrix(context.args);
                for (const line of coverageMatrixLines(context.args.firm)) {
                    ui.note(line);
                }
                return;
            }
            const isJson = context.args.json;
            if (isJson && context.args.risk !== undefined) {
                throw new Error(
                    '--risk prints the EV swing as text and cannot be combined with --json',
                );
            }
            rejectRiskWithSuspended(context.args);
            const riskInputs = readNextTradeRiskInputs(context.args);
            const { options, plan, snapshot } = readAdviseInputs(context.args);
            if (!isJson) {
                spinner = ui.spinner(`${plan.label}: advise`).start();
            }
            const account = AccountReconstruction.rebuild(snapshot, plan);
            const advisor = createSizingAdvisor(account, options);
            const advice = advisor.assemble(engineResultsFor(advisor, plan));
            const riskReport =
                riskInputs === null
                    ? null
                    : nextTradeRiskReport(advisor, riskInputs);
            if (isJson) {
                process.stdout.write(`${adviceJson(advice, riskReport)}\n`);
                return;
            }
            spinner?.succeed(plan.label);
            ui.heading(plan.label);
            const enteredStopPoints =
                options.positionSizing?.stopPoints ?? null;
            for (const line of adviceReportLines(advice, enteredStopPoints)) {
                ui.note(line);
            }
            const riskRaw = context.args.risk;
            if (riskRaw !== undefined) {
                const risk = readPositiveNumber(riskRaw, 'risk');
                const rr = readPositiveNumber(context.args.rr, 'rr');
                const spec = documentedPolicySpecFor(account, plan, options);
                const outcome = tradeValueSwing(account, spec, { risk, rr });
                const documentedRewardMultiple =
                    advice.documented?.rewardMultiple ?? null;
                const swing = swingLines(
                    outcome,
                    rr,
                    documentedRewardMultiple,
                    plan.retryFee(),
                );
                for (const line of swing) {
                    ui.note(line);
                }
            }
            if (riskReport !== null) {
                for (const line of nextTradeRiskReportLines(riskReport)) {
                    ui.note(line);
                }
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function nextTradeRiskReport(
    advisor: SizingAdvisor,
    inputs: NextTradeRiskInputs,
): NextTradeRiskReport {
    const day = dayProgressFromCounts(advisor, inputs.wins, inputs.losses);
    const { proposedRisk } = inputs;
    const result = advisor.checkNextTradeRisk(proposedRisk, day);
    return result === null
        ? {
              day,
              kind: NextTradeRiskReportKind.NotRun,
              proposedRisk,
              reason: riskCheckNotRunReason(advisor),
          }
        : { day, kind: NextTradeRiskReportKind.Checked, proposedRisk, result };
}

export function nextTradeRiskReportLines(
    report: NextTradeRiskReport,
): string[] {
    switch (report.kind) {
        case NextTradeRiskReportKind.Checked: {
            return nextTradeRiskCheckLines(report.result, report.day);
        }
        case NextTradeRiskReportKind.NotRun: {
            return ['next-trade risk check: not run', report.reason];
        }
    }
}

export function readAdviseInputs(arguments_: AdviseArguments): AdviseInputs {
    const plan = planResolver.resolveOne(arguments_);
    const stage = readStage(arguments_.stage);
    const lifecycleRejection = validateStageForPlan(stage, plan);
    if (lifecycleRejection !== null) {
        throw new Error(
            describeLifecycleRejection(lifecycleRejection, {
                facts: plan,
                stage,
            }),
        );
    }
    checkOptIn(
        arguments_['funded-reset'] ?? false,
        PlanOptIn.FundedReset,
        plan,
        'funded-reset',
    );
    checkOptIn(
        arguments_['early-withdrawal'] ?? false,
        PlanOptIn.OneTimeEarlyWithdrawal,
        plan,
        'early-withdrawal',
    );

    const draft = readSnapshotDraft(arguments_, stage);
    checkRequiredSnapshotFields(plan, stage, draft);

    const snapshot = accountSnapshotInputSchema.parse(draft);
    try {
        assertPlausibleSnapshot(plan, snapshot);
    } catch (error) {
        if (!(error instanceof ImplausibleSnapshotError)) throw error;
        throw new Error(
            error.issues
                .map(
                    (issue) =>
                        `--${PLAUSIBILITY_FIELD_FLAG[issue.field]}: ${issue.message}`,
                )
                .join(' '),
            { cause: error },
        );
    }

    const rulebook = readRulebook(arguments_);

    const retainCushionRaw = arguments_['retain-cushion'];
    const personalRetainedCushion: Dollars | undefined =
        retainCushionRaw === undefined
            ? undefined
            : dollars(
                  readNonNegativeNumber(retainCushionRaw, 'retain-cushion'),
              );

    const requestSizeRaw = arguments_['request-size'];
    const personalPayoutOverride: Dollars | undefined =
        requestSizeRaw === undefined
            ? undefined
            : dollars(readPositiveNumber(requestSizeRaw, 'request-size'));

    const rebuyLagRaw = arguments_['rebuy-lag-days'];
    const measuredRebuyLag =
        rebuyLagRaw === undefined
            ? undefined
            : {
                  days: readNonNegativeNumber(rebuyLagRaw, 'rebuy-lag-days'),
                  samples: 1,
              };

    const stopPointsRaw = arguments_['stop-points'];
    const positionSizing =
        stopPointsRaw === undefined
            ? undefined
            : {
                  instrument: arguments_.instrument,
                  stopPoints: readPositiveNumber(stopPointsRaw, 'stop-points'),
              };

    const seed = readPositiveInteger(arguments_.seed, 'seed');
    const trials = readPositiveInteger(arguments_.trials, 'trials');

    const options: SizingAdvisorCreateOptions = {
        accountPolicy: requireFirm(plan.id.firm).accountPolicy,
        ...(measuredRebuyLag !== undefined && { measuredRebuyLag }),
        ...(personalPayoutOverride !== undefined && {
            personalPayoutOverride,
        }),
        ...(personalRetainedCushion !== undefined && {
            personalRetainedCushion,
        }),
        ...(positionSizing !== undefined && { positionSizing }),
        rulebook,
        seed,
        sims: trials,
        snapshotAsOf: snapshot.asOf,
        substate: arguments_.suspended ? AccountSubstate.Suspended : null,
        today: todayIsoDate(new Date()),
        trials,
    };

    return { options, plan, snapshot, stage };
}

export function rejectRiskWithSuspended(
    arguments_: Pick<AdviseArguments, 'risk' | 'suspended'>,
): void {
    if (arguments_.suspended && arguments_.risk !== undefined) {
        throw new Error(
            '--risk prints the EV swing at a risk, and a suspended account is not sized, so --risk cannot be combined with --suspended',
        );
    }
}

export function swingLines(
    outcome: TradeValueSwingOutcome,
    rr: number,
    documentedRewardMultiple: null | number,
    replacementFee: number,
): string[] {
    if (outcome.kind === ValueResultKind.NotModeled) {
        return [`EV swing: not modeled (${outcome.reason})`];
    }
    const { afterLoss, afterWin, now } = netOfReplacementFee(
        outcome,
        replacementFee,
    );
    const whatIf =
        documentedRewardMultiple !== null && documentedRewardMultiple !== rr
            ? ` (what-if: differs from the documented 1:${documentedRewardMultiple})`
            : '';
    const bustNote = outcome.afterLossBusted
        ? `, a loss busts the account (rebuy lag ${outcome.afterLossRebuyLagDays ?? 0} days, replacement fee ${formatCurrency(replacementFee)} netted off)`
        : '';
    const delta = (to: typeof now) =>
        uncertainCurrency(valueGap(now, to, CreditBasis.CreditFree));
    return [
        `EV swing at 1:${rr}${whatIf}, credit-free, ${outcome.assumption}: now ${uncertainCurrency(now.creditFree)}, after a win ${uncertainCurrency(afterWin.creditFree)} (${delta(afterWin)}), after a loss ${uncertainCurrency(afterLoss.creditFree)} (${delta(afterLoss)})${bustNote}, win probability ${formatPercent(outcome.winProbability)}`,
    ];
}

function checkOptIn(
    isTaken: boolean,
    optIn: PlanOptIn,
    plan: Plan,
    flagName: string,
): void {
    if (!isTaken || offeredPlanOptIns(plan).includes(optIn)) return;
    throw new Error(
        `--${flagName} is not offered on ${plan.label} (${describePlanOptIn(optIn)})`,
    );
}

function checkRequiredSnapshotFields(
    plan: Plan,
    stage: AccountStage,
    draft: Record<string, unknown>,
): void {
    const rules = snapshotFieldRules(plan, stage);
    const isFilled = (field: SnapshotField): boolean =>
        draft[snapshotFieldToInputKey(field)] !== undefined;
    const missing = missingSnapshotFields(rules, isFilled);
    if (missing.length > 0) {
        const names = missing.map((field) => {
            const flag = `--${SNAPSHOT_FIELD_FLAG[field.field]}`;
            return field.alternative === null
                ? flag
                : `${flag} (or --${SNAPSHOT_FIELD_FLAG[field.alternative.field]})`;
        });
        throw new Error(`Missing required flags: ${names.join(', ')}`);
    }
    for (const rule of rules) {
        if (
            rule.requirement !== SnapshotFieldRequirement.Hidden ||
            !isFilled(rule.field)
        ) {
            continue;
        }
        throw new Error(
            `--${SNAPSHOT_FIELD_FLAG[rule.field]} is not used on stage "${stage}"`,
        );
    }
}

const RISK_CHECK_NO_RUNG_REASON =
    'no documented rung applies to this account, so there is nothing to check the proposed risk against';

const STALE_REMEDY_TEXT: Readonly<Record<AdviceStalenessReason, string>> = {
    [AdviceStalenessReason.FundedSnapshotStale]:
        "enter today's balance for fresh rung amounts",
    [AdviceStalenessReason.PlanRulesChanged]:
        'recompute the advice against the current rules',
    [AdviceStalenessReason.SessionSnapshotStale]:
        "enter today's balance for fresh rung amounts",
};

const STALE_REASON_WORDS: Readonly<Record<AdviceStalenessReason, string>> = {
    [AdviceStalenessReason.FundedSnapshotStale]:
        'the funded balance snapshot is older than the review cadence allows',
    [AdviceStalenessReason.PlanRulesChanged]:
        'the plan rules changed since this advice was computed',
    [AdviceStalenessReason.SessionSnapshotStale]:
        'more than one trading session has passed since the last balance entry',
};

const COVERAGE_UNSUPPORTED_REASON_TEXT: Readonly<
    Record<AdviceCoverageUnsupportedReason, string>
> = {
    [AdviceCoverageUnsupportedReason.InstantFundedNoEval]:
        'instant-funded, no eval',
    [AdviceCoverageUnsupportedReason.LiveNotModeled]: 'live not modeled',
    [AdviceCoverageUnsupportedReason.Suspended]: 'suspended',
};

export function documentedSizingLines(
    sizing: DocumentedSizing,
    enteredStopPoints: null | number,
): string[] {
    const lines: string[] = [
        `provenance: ${sizing.provenance}, reward multiple ${sizing.rewardMultiple}, stop ${JSON.stringify(sizing.stopRule)}`,
    ];
    let rungIndex = 0;
    for (const rung of sizing.rungs) {
        rungIndex += 1;
        const capped =
            rung.cappedBy.length === 0
                ? ''
                : ` (${rung.cappedBy.map((constraint) => SIZING_CONSTRAINT_TEXT[constraint]).join(' ')})`;
        lines.push(
            `rung ${rungIndex}: risk ${formatCurrency(rung.risk)}, TP ${formatCurrency(rung.takeProfit)}, running loss ${formatCurrency(rung.runningLossBefore)} -> ${formatCurrency(rung.runningLossAfter)}${capped}`,
        );
    }
    if (sizing.dailyProfitCap !== null) {
        lines.push(
            sizing.dailyProfitCap.kind === DailyProfitCapKind.HardCeiling
                ? `daily profit ceiling: ${formatCurrency(sizing.dailyProfitCap.ceiling)}`
                : `daily stop trigger: ${formatCurrency(sizing.dailyProfitCap.stopAfter)}`,
        );
    }
    if (
        sizing.minStopPointsAtCap !== null &&
        (enteredStopPoints === null ||
            sizing.minStopPointsAtCap > enteredStopPoints)
    ) {
        lines.push(
            `minimum stop to stay at the contract cap: ${sizing.minStopPointsAtCap} pts`,
        );
    }
    for (const assumption of sizing.assumptions) {
        lines.push(SIZING_ASSUMPTION_TEXT[assumption]);
    }
    return lines;
}

export function nextTradeRiskCheckLines(
    result: NextTradeRiskCheckResult,
    day?: DayProgress,
): string[] {
    const lines = [`next-trade risk check: ${result.verdict}`];
    if (result.documentedRung !== null) {
        lines.push(`documented rung: ${formatCurrency(result.documentedRung)}`);
    }
    if (result.stopReason !== null) {
        lines.push(
            'the documented plan is to stop for today, so no risk is within the plan',
            DAY_STOP_REASON_TEXT[result.stopReason],
        );
    }
    if (result.dpRisk !== null) {
        lines.push(`DP risk: ${formatCurrency(result.dpRisk)}`);
    }
    if (result.excessCents > 0) {
        lines.push(
            `excess above the cap: ${formatCurrency(result.excessCents / 100)}`,
        );
    }
    if (result.payoutEligibleAboveRung) {
        lines.push(
            'this account is already payout-eligible; the excess risk is not needed to stay eligible',
        );
    }
    if (day !== undefined && (day.wins > 0 || day.losses > 0)) {
        lines.push(
            SIZING_ASSUMPTION_TEXT[SizingAssumption.RungsAssumeEarlierLosses],
            SIZING_ASSUMPTION_TEXT[SizingAssumption.WinsAddNoLossRoom],
        );
    }
    return lines;
}

export function readNextTradeRiskInputs(
    arguments_: Pick<
        AdviseArguments,
        'losses-today' | 'proposed-risk' | 'wins-today'
    >,
): NextTradeRiskInputs | null {
    const proposedRiskRaw = arguments_['proposed-risk'];
    if (proposedRiskRaw === undefined) {
        const orphans = (['wins-today', 'losses-today'] as const).filter(
            (flag) => arguments_[flag] !== undefined,
        );
        if (orphans.length > 0) {
            throw new Error(
                `${orphans.map((flag) => `--${flag}`).join(' and ')} only feed the next-trade risk check: add --proposed-risk`,
            );
        }
        return null;
    }
    return {
        losses: readNonNegativeInteger(
            arguments_['losses-today'] ?? '0',
            'losses-today',
        ),
        proposedRisk: dollars(
            readPositiveNumber(proposedRiskRaw, 'proposed-risk'),
        ),
        wins: readNonNegativeInteger(
            arguments_['wins-today'] ?? '0',
            'wins-today',
        ),
    };
}

export function readSignedNumber(raw: string, name: string): number {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        throw new Error(`--${name} must be a number, got "${raw}"`);
    }
    const parsed = z.coerce.number().safeParse(trimmed);
    if (!parsed.success) {
        throw new Error(`--${name} must be a number, got "${raw}"`);
    }
    return parsed.data;
}

function coverageLineFor(
    plan: Plan,
    stage: SizingStage,
    substate: AccountSubstate,
    today: string,
): string {
    const label = `${plan.label} x ${stage} x ${substate}`;
    const outcome = adviceCoverageOf(plan, stage, substate, today);
    return outcome.kind === AdviceCoverageOutcomeKind.Advice
        ? `${label}: advice (${outcome.advice.headline})`
        : `${label}: unsupported (${COVERAGE_UNSUPPORTED_REASON_TEXT[outcome.reason]})`;
}

function documentedPolicySpecFor(
    account: ReconstructedAccount,
    plan: Plan,
    options: SizingAdvisorCreateOptions,
): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: TRADING_DAYS_PER_YEAR,
        measuredRebuyLag: options.measuredRebuyLag ?? null,
        plan,
        positionSizing:
            options.positionSizing === undefined ||
            options.positionSizing === null
                ? null
                : {
                      instrument: options.positionSizing.instrument,
                      stopPoints: points(options.positionSizing.stopPoints),
                  },
        rulebook: options.rulebook,
    });
    return documentedPolicySpecSchema.parse({
        enginePolicy: policy,
        rulebook: options.rulebook,
        run: {
            maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
            seed: options.seed ?? 42,
            trials: options.trials ?? 1,
        },
    });
}

function engineOptimaLines(
    results: readonly EngineOptimumRunnerResult[],
    requests: readonly EngineOptimumRequest[],
): string[] {
    return results.flatMap((result): string[] => {
        switch (result.source) {
            case AdviceSource.FundedSweepFresh: {
                return fundedSweepLines('fresh funded sweep', result.sweep);
            }
            case AdviceSource.FundedSweepFromState: {
                if (
                    result.sweep.kind ===
                    FundedFromStateOptimumResultKind.NoCandidates
                ) {
                    return [
                        `from-state funded sweep: no candidates (${result.sweep.refusal.kind})`,
                    ];
                }
                const { optimum } = result.sweep;
                return [
                    `from-state funded sweep: ${optimum.label}, from-state expected cash ${formatCurrencyWithSe(optimum.fromStateExpectedCash, optimum.fromStateExpectedCashStandardError)}, ex-credit ${formatCurrencyWithSe(optimum.fromStateExpectedRealizedCash, optimum.fromStateExpectedRealizedCashStandardError)}, survivors ${optimum.survivors}`,
                ];
            }
            case AdviceSource.LadderSearchFresh:
            case AdviceSource.LadderSearchFromState: {
                return ladderSearchLines(
                    result,
                    requests.find(
                        (request): request is LadderSearchRequest =>
                            request.source === result.source,
                    ),
                );
            }
            case AdviceSource.NextPayoutProjection: {
                return [nextPayoutProjectionLine(result.projection)];
            }
            case AdviceSource.PayoutSizeSweep: {
                return payoutSizeSweepLines(result.sweep);
            }
        }
    });
}

function fundedSweepLines(
    label: string,
    sweep: FundedSweepOptimumResult,
): string[] {
    if (sweep.kind === FundedSweepOptimumResultKind.NoCandidates) {
        return [`${label}: no candidates (${sweep.refusal.kind})`];
    }
    const { optimum } = sweep;
    return [
        `${label}: ${optimum.label}, monthly net ${formatCurrencyWithSe(optimum.expectedMonthlyNet, optimum.expectedMonthlyNetStandardError)}, monthly ex-credit ${formatCurrencyWithSe(optimum.expectedMonthlyRealizedNet, optimum.expectedMonthlyRealizedNetStandardError)}, survivors ${optimum.survivors}`,
    ];
}

function ladderGridLine(request: LadderSearchRequest): string {
    const { grid, maxGridSize } = request;
    const cap =
        maxGridSize === undefined
            ? ''
            : `, at most ${maxGridSize.toLocaleString('en-US')} ladders`;
    return `ladder grid: ${formatCurrency(grid.lo)} to ${formatCurrency(grid.max)} in steps of ${formatCurrency(grid.step)}, ${grid.slots} slots${cap}`;
}

function ladderSearchLines(
    result: LadderEngineOptimumResult,
    request: LadderSearchRequest | undefined,
): string[] {
    const { source } = result;
    if (result.kind === LadderEngineOptimumResultKind.Refused) {
        return [`${source}: ${ladderRefusalText(result.refusal)}`];
    }
    const { ladder } = result;
    const summary = `${source}: ${ladder.laddersScored} ladders scored, ${ladder.frontier.length} on the frontier`;
    const gridLines = request === undefined ? [] : [ladderGridLine(request)];
    const winner = ladder.bySpeed[0];
    if (winner === undefined) return [summary, ...gridLines];
    return [
        summary,
        ...gridLines,
        `  fastest-to-funded ladder (eval-stage proxy for MonthlyNet, Hard Rule 3) [${winner.ladder.join(', ')}]: days to funded ${formatNumberWithSe(winner.expectedDaysToFunded, winner.expectedDaysToFundedStandardError, 1)}, pass rate ${formatPercentWithSe(winner.passRate, winner.passRateStandardError)}, cost/funded ${formatCurrencyWithSe(winner.costPerFunded, winner.costPerFundedStandardError)}`,
    ];
}

function nextPayoutProjectionLine(projection: NextPayoutProjection): string {
    const timing = `next payout projection: ${nextPayoutTimingText(projection)}`;
    const evidence = nextPayoutEvidenceText(projection);
    if (
        nextPayoutTimingOf(projection).kind ===
        NextPayoutTimingKind.AlreadyEligible
    ) {
        return `${timing}, ${evidence}`;
    }
    const probabilityText =
        projection.accountLostBeforeFirstPayoutProbability === null
            ? 'n/a'
            : formatPercent(projection.accountLostBeforeFirstPayoutProbability);
    return `${timing}, account lost before first payout ${probabilityText}, ${evidence}`;
}

function nextPayoutTimingText(projection: NextPayoutProjection): string {
    const timing = nextPayoutTimingOf(projection);
    switch (timing.kind) {
        case NextPayoutTimingKind.AlreadyEligible: {
            return NEXT_PAYOUT_ELIGIBLE_NOW_TEXT.toLowerCase();
        }
        case NextPayoutTimingKind.InDays: {
            return `${timing.calendarDays.value.toFixed(1)} calendar days ${NEXT_PAYOUT_AMONG_PAYING_TEXT}`;
        }
        case NextPayoutTimingKind.NoTrialPaid: {
            return NEXT_PAYOUT_NO_TRIAL_PAID_TEXT.toLowerCase();
        }
    }
}

function payoutAdviceLines(advice: PayoutAdvice): string[] {
    return payoutDecisionLines(advice.documented);
}

function payoutBlockReasonLines(reason: PayoutBlockReason): string[] {
    switch (reason.kind) {
        case PayoutBlockReasonKind.Gate: {
            return [`payout: not eligible (${reason.gate})`];
        }
        case PayoutBlockReasonKind.PayoutPending: {
            return ['payout: not eligible (a payout is already pending)'];
        }
        case PayoutBlockReasonKind.WouldTriggerLive: {
            return [
                `payout: not eligible (would trigger a live-account transition: ${liveTriggerCountText(reason.trigger)})`,
            ];
        }
    }
}

function payoutDecisionLines(decision: PayoutRequestDecision): string[] {
    switch (decision.kind) {
        case PayoutRequestDecisionKind.NotEligible: {
            return payoutBlockReasonLines(decision.reason);
        }
        case PayoutRequestDecisionKind.Request: {
            const lines = [
                `payout: request ${formatCurrency(decision.requestAmount)}, retained cushion ${formatCurrency(decision.retainedCushion)} (${decision.retainedCushionBasis})`,
            ];
            if (decision.notice !== null) {
                lines.push(
                    `firm minimum ${formatCurrency(decision.notice.minimumRequestAmount)} is above your ${formatCurrency(decision.notice.requestedAmount)} request`,
                );
            }
            return lines;
        }
        case PayoutRequestDecisionKind.Unreachable: {
            return ['payout: unreachable from this state'];
        }
        case PayoutRequestDecisionKind.Wait: {
            return [payoutWaitLine(decision.wait)];
        }
    }
}

function payoutSizeSweepLines(sweep: PayoutSizeSweepResult): string[] {
    if (sweep.kind === PayoutSizeSweepResultKind.NoOptimum) {
        return [`payout-size sweep: ${sweep.issue}`];
    }
    const { optimum } = sweep;
    const { winner } = optimum;
    const winnerValue = payoutSweepRowValue(winner);
    const lines = [
        `payout-size sweep: $${winner.requestSize} requested, credit-sensitive ${String(optimum.creditSensitive)}, monthly net ${formatCurrencyWithSe(winnerValue.value, winnerValue.standardError)}`,
    ];
    if (optimum.personalOverride !== null) {
        lines.push(...personalPayoutOverrideLines(optimum.personalOverride));
    }
    return lines;
}

function payoutSweepRowValue(row: PayoutSizeSweepRow): UncertainValue {
    return row.kind === StartBasis.Fresh
        ? {
              standardError: row.out.estimates.expectedMonthlyNet.standardError,
              value: row.out.expectedMonthlyNet,
          }
        : {
              standardError:
                  row.out.estimates.fromStateExpectedCash.standardError,
              value: row.out.fromStateExpectedCash,
          };
}

function payoutWaitLine(wait: PayoutWait): string {
    switch (wait.basis) {
        case PayoutWaitBasis.CalendarDays: {
            return `wait: ${wait.daysStillNeeded} calendar days`;
        }
        case PayoutWaitBasis.NoClosedForm: {
            return 'wait: not computable in closed form';
        }
        case PayoutWaitBasis.Profit: {
            return `wait: ${formatCurrency(wait.profitStillNeeded)} more profit`;
        }
        case PayoutWaitBasis.QualifyingDays: {
            return `wait: ${wait.daysStillNeeded} qualifying days`;
        }
    }
}

function personalPayoutOverrideLines(
    override: PersonalPayoutOverrideResult,
): string[] {
    const overrideValue = payoutSweepRowValue(override.row);
    const lines = [
        `payout-size sweep personal override: $${override.row.requestSize} requested, monthly net ${formatCurrencyWithSe(overrideValue.value, overrideValue.standardError)}`,
    ];
    if (override.warning !== null) {
        lines.push(
            personalPayoutOverrideWarningText(override.warning),
        );
    }
    return lines;
}

function provenanceLine(provenance: AdviceProvenance): string {
    const parts = [
        `source ${provenance.source}`,
        sizingObjectiveText(provenance.objective),
        `start ${provenance.startBasis}`,
        `snapshot ${provenance.snapshotDate}`,
        `computed ${provenance.computedAt}`,
    ];
    if (provenance.firmDataDate !== null) {
        parts.push(`firm data verified ${provenance.firmDataDate}`);
    }
    if (provenance.planRulesFingerprint !== null) {
        parts.push(`plan rules ${provenance.planRulesFingerprint}`);
    }
    if (provenance.seed !== null) parts.push(`seed ${provenance.seed}`);
    if (provenance.trials !== null) parts.push(`trials ${provenance.trials}`);
    if (provenance.solverVersion !== null) {
        parts.push(`solver ${provenance.solverVersion}`);
    }
    return `provenance: ${parts.join(', ')}`;
}

function readDate(raw: string | undefined, name: string): string | undefined {
    if (raw === undefined) return undefined;
    if (!isAccountDate(raw)) {
        throw new Error(`--${name} must be a date (YYYY-MM-DD), got "${raw}"`);
    }
    return raw;
}

function readRulebook(arguments_: AdviseArguments): RulebookParameters {
    const requestSizeRaw = arguments_['request-size'];
    const retainCushionRaw = arguments_['retain-cushion'];
    const candidate: RulebookParameters = {
        ...DEFAULT_RULEBOOK,
        eval: {
            ...DEFAULT_RULEBOOK.eval,
            ladderFractionSource: z
                .enum(LadderFractionSource)
                .parse(arguments_['ladder-fractions']),
            mode: z.enum(EvalSizingMode).parse(arguments_['eval-mode']),
        },
        payout: {
            ...DEFAULT_RULEBOOK.payout,
            allowBelowHardRule2: arguments_['allow-below-hard-rule-2'] ?? false,
            requestCents:
                requestSizeRaw === undefined
                    ? DEFAULT_RULEBOOK.payout.requestCents
                    : Math.round(
                          readPositiveNumber(requestSizeRaw, 'request-size') *
                              100,
                      ),
            retainedCushionCents:
                retainCushionRaw === undefined
                    ? DEFAULT_RULEBOOK.payout.retainedCushionCents
                    : Math.round(
                          readNonNegativeNumber(
                              retainCushionRaw,
                              'retain-cushion',
                          ) * 100,
                      ),
        },
        strategy: {
            rr: readPositiveNumber(arguments_.rr, 'rr'),
            tradesPerDayMax: readPositiveInteger(arguments_.tpd, 'tpd'),
            winrate: readNonNegativeNumber(arguments_.winrate, 'winrate'),
        },
    };
    const parsed = rulebookSchema.safeParse(candidate);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        throw new Error(issue?.message ?? 'Invalid rulebook overrides');
    }
    return parsed.data;
}

function readSnapshotDraft(
    arguments_: AdviseArguments,
    stage: SizingStage,
): Record<string, unknown> {
    const draft: Record<string, unknown> = {
        asOf:
            arguments_['snapshot-date'] === undefined
                ? todayIsoDate(new Date())
                : readDate(arguments_['snapshot-date'], 'snapshot-date'),
        dashboardConvention: z
            .enum(DashboardBalanceConvention)
            .parse(arguments_['dashboard-convention']),
        stage,
    };
    setSigned(draft, 'balance', arguments_.balance);
    setSigned(draft, 'balanceAtLastPayout', arguments_['last-payout-balance']);
    setSigned(draft, 'dashboardFloor', arguments_['dashboard-floor']);
    setSigned(draft, 'highestEodBalance', arguments_['highest-eod']);
    setSigned(draft, 'highestIntradayBalance', arguments_['highest-intraday']);
    setSigned(draft, 'floorAtLastPayout', arguments_['floor-at-last-payout']);
    setNonNegative(draft, 'cumulativePayout', arguments_['cumulative-payout']);
    setNonNegative(draft, 'cycleBestDayProfit', arguments_['cycle-best-day']);
    setNonNegative(draft, 'evalBestDayProfit', arguments_['eval-best-day']);
    setNonNegative(draft, 'liveStartBalance', arguments_['live-start-balance']);
    setCount(draft, 'payoutsTaken', arguments_.payouts);
    setCount(draft, 'tradingDays', arguments_['trading-days']);
    setCount(
        draft,
        'qualifyingDaysSinceLastPayout',
        arguments_['qualifying-days'],
    );
    setCount(draft, 'fundedResetsUsed', arguments_['funded-resets-used']);
    const lastPayoutOn = readDate(
        arguments_['last-payout-date'],
        'last-payout-date',
    );
    if (lastPayoutOn !== undefined) draft.lastPayoutOn = lastPayoutOn;
    const lastTradedOn = readDate(
        arguments_['last-traded-date'],
        'last-traded-date',
    );
    if (lastTradedOn !== undefined) draft.lastTradedOn = lastTradedOn;
    const firstFundedTradeOn = readDate(
        arguments_['first-funded-trade-date'],
        'first-funded-trade-date',
    );
    if (firstFundedTradeOn !== undefined) {
        draft.firstFundedTradeOn = firstFundedTradeOn;
    }
    return draft;
}

function readStage(raw: string | undefined): SizingStage {
    if (raw === undefined) {
        throw new Error(
            `--stage is required (${Object.values(SizingStage).join(', ')})`,
        );
    }
    const parsed = z.enum(SizingStage).safeParse(raw);
    if (!parsed.success) {
        throw new Error(
            `--stage must be one of ${Object.values(SizingStage).join(', ')}, got "${raw}"`,
        );
    }
    return parsed.data;
}

function rejectRiskFlagsWithMatrix(
    arguments_: Pick<
        AdviseArguments,
        'losses-today' | 'proposed-risk' | 'risk' | 'wins-today'
    >,
): void {
    const ignored = (
        ['proposed-risk', 'wins-today', 'losses-today', 'risk'] as const
    ).filter((flag) => arguments_[flag] !== undefined);
    if (ignored.length > 0) {
        throw new Error(
            `--matrix prints the coverage matrix from synthetic snapshots and cannot be combined with ${ignored.map((flag) => `--${flag}`).join(' or ')}`,
        );
    }
}

function requireFirm(firmId: FirmId): TradingFirm {
    const firm = findFirm(firmId);
    if (!firm) throw new Error(`Firm "${firmId}" is not registered.`);
    return firm;
}

function riskCheckNotRunReason(advisor: SizingAdvisor): string {
    if (advisor.isSuspended()) {
        return differenceReasonText({ kind: DifferenceReason.Suspended });
    }
    const staleness = advisor.staleness();
    return staleness.kind === 'stale'
        ? `the advice is stale as of ${staleness.snapshotAsOf} (${staleReasonWords(staleness.reasons)}), so there is no documented rung to check against: ${staleRemedy(staleness.reasons)}`
        : RISK_CHECK_NO_RUNG_REASON;
}

function setCount(
    draft: Record<string, unknown>,
    key: string,
    raw: string | undefined,
): void {
    if (raw === undefined) return;
    draft[key] = readNonNegativeNumber(raw, key);
}

function setNonNegative(
    draft: Record<string, unknown>,
    key: string,
    raw: string | undefined,
): void {
    if (raw === undefined) return;
    draft[key] = readNonNegativeNumber(raw, key);
}

function setSigned(
    draft: Record<string, unknown>,
    key: string,
    raw: string | undefined,
): void {
    if (raw === undefined) return;
    draft[key] = readSignedNumber(raw, MONEY_FLAG_LABEL[key] ?? key);
}

function snapshotFieldToInputKey(field: SnapshotField): string {
    switch (field) {
        case SnapshotField.AsOf: {
            return 'asOf';
        }
        case SnapshotField.Balance: {
            return 'balance';
        }
        case SnapshotField.BalanceAtLastPayout: {
            return 'balanceAtLastPayout';
        }
        case SnapshotField.CumulativePayout: {
            return 'cumulativePayout';
        }
        case SnapshotField.CycleBestDayProfit: {
            return 'cycleBestDayProfit';
        }
        case SnapshotField.DashboardFloor: {
            return 'dashboardFloor';
        }
        case SnapshotField.EvalBestDayProfit: {
            return 'evalBestDayProfit';
        }
        case SnapshotField.FloorAtLastPayout: {
            return 'floorAtLastPayout';
        }
        case SnapshotField.HighestEodBalance: {
            return 'highestEodBalance';
        }
        case SnapshotField.HighestIntradayBalance: {
            return 'highestIntradayBalance';
        }
        case SnapshotField.LastPayoutOn: {
            return 'lastPayoutOn';
        }
        case SnapshotField.LastTradedOn: {
            return 'lastTradedOn';
        }
        case SnapshotField.PayoutsTaken: {
            return 'payoutsTaken';
        }
        case SnapshotField.QualifyingDaysSinceLastPayout: {
            return 'qualifyingDaysSinceLastPayout';
        }
        case SnapshotField.TradingDays: {
            return 'tradingDays';
        }
    }
}

function staleReasonWords(reasons: readonly AdviceStalenessReason[]): string {
    return reasons.map((reason) => STALE_REASON_WORDS[reason]).join('; ');
}

function staleRemedy(reasons: readonly AdviceStalenessReason[]): string {
    return [
        ...new Set(reasons.map((reason) => STALE_REMEDY_TEXT[reason])),
    ].join('; ');
}

function uncertainCurrency(value: UncertainValue): string {
    return value.standardError === null
        ? formatCurrency(value.value)
        : `${formatCurrency(value.value)} (SE ${formatCurrency(value.standardError)})`;
}
