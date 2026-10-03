import { planReferenceOf } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollModel';
import {
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_MAX_EVAL_DAYS,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type BankrollPlanReference,
    type BankrollPlanVariantInputs,
    type NextRoundToolsRequest,
    ToolsRequestKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { measuredRebuyLagFromStats } from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import { DEFAULT_REALIZED_HORIZON_DAYS } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    accountRoundId,
    compareText,
    type ExternalFirmName,
    type FirmColumns,
    firmKeyId,
    FirmKeyKind,
    firmKeyLabel,
    firmKeyOf,
    formatUsdCents,
    type LedgerRoundRow,
    perAttemptNetCents,
    type PortfolioLedger,
    realizedOutcomes,
    replacementStats,
    RoundStatus,
    roundStatusLabel,
    type SampledEstimate,
    SampleLevel,
    summarizeCash,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts';
import {
    roundCycle,
    type RoundFirmSummary,
    type RoundReturn,
    roundReturns,
    type RoundSuggestion,
    roundSuggestions,
    type ScaleGate,
    scaleGateFromLedger,
    ScaleGateStatus,
} from '~/lib/prop-accounts/bankroll';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    dollars,
    findFirm,
    fraction,
    parseFirmId,
    type Plan,
    type PlanOptIns,
    TRADING_DAYS_PER_MONTH,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    type EnginePolicy,
    enginePolicySchema,
    type MeasuredRebuyLag,
    type RulebookParameters,
    type SampleThresholds,
} from '~/lib/prop-calculator/advisor';
import {
    type BankrollPolicy,
    type BankrollTimelineResult,
} from '~/lib/prop-calculator/portfolioTimeline';

export const ROUNDS_BOOTSTRAP_DRAWS = 500;
export const ROUNDS_BOOTSTRAP_SEED = 20_260_927;
export const NEXT_ROUND_TRIALS = 2000;
export const NEXT_ROUND_SCALE_GATE_NOT_READY_TEXT = 'scale gate not met';
export const NEXT_ROUND_SCALE_GATE_THRESHOLDS_NOT_SET_TEXT =
    'thresholds not set';

export enum NextRoundRecommendation {
    OptionA = 'optionA',
    OptionB = 'optionB',
}

export interface FirmSelectOption {
    readonly label: string;
    readonly value: string;
}

export interface NextRoundCardInputs {
    readonly availableCents: null | number;
    readonly ledger: PortfolioLedger;
    readonly rulebook: RulebookParameters;
    readonly runId: number;
    readonly today: string;
    readonly trades: number;
}

export interface NextRoundCardModel {
    readonly leftOutLabels: readonly string[];
    readonly measuredCycleDays: null | number;
    readonly modeledRr: number;
    readonly modeledWinrate: number;
    readonly planLabel: string;
    readonly realizedPassRate: null | {
        readonly n: number;
        readonly value: number;
    };
    readonly rebuyLagNote: string;
    readonly request: NextRoundToolsRequest;
    readonly roundId: string;
    readonly roundLabel: string;
    readonly scaleGate: ScaleGate;
}

export interface NextRoundOptionSummary {
    readonly medianMonthlyNet: string;
    readonly pathRuin: string;
    readonly pRoundNetNegative: string;
    readonly scaleGateNote: null | string;
    readonly startingBankroll: string;
}

export interface NextRoundResultInputs {
    readonly dayBudget: number;
    readonly optionABudget: number;
    readonly optionAResult: BankrollTimelineResult;
    readonly optionBBudget: number;
    readonly optionBResult: BankrollTimelineResult;
    readonly scaleGate: ScaleGate;
}

export interface NextRoundResultSummary {
    readonly optionA: NextRoundOptionSummary;
    readonly optionB: NextRoundOptionSummary;
    readonly recommended: NextRoundRecommendation;
}

export interface RoundFirmSummaryRow {
    readonly closedRounds: string;
    readonly firm: string;
    readonly key: string;
    readonly max: string;
    readonly mean: string;
    readonly min: string;
    readonly rounds: string;
    readonly sampleLevel: null | SampleLevel;
    readonly sharePositive: string;
}

export interface RoundRow {
    readonly budgetPercentUsed: null | number;
    readonly budgetText: string;
    readonly closedOn: null | string;
    readonly cycleDays: string;
    readonly firm: string;
    readonly id: string;
    readonly inProgressText: string;
    readonly label: string;
    readonly likeThisEndsNetNegativeClosedForm: string;
    readonly likeThisEndsNetNegativeModeled: string;
    readonly netCents: string;
    readonly openedOn: string;
    readonly openMemberCount: number;
    readonly ownOutcomeNetNegative: boolean;
    readonly payoutsCents: string;
    readonly realizedMultiple: string;
    readonly status: RoundStatus;
    readonly statusLabel: string;
    readonly toDateMultiple: string;
}

export interface RoundsPageModel {
    readonly perFirm: readonly RoundFirmSummaryRow[];
    readonly rounds: readonly RoundRow[];
    readonly suggestions: readonly RoundSuggestionRow[];
    readonly unassignedRoundCount: number;
}

export interface RoundSuggestionRow {
    readonly earliestPurchase: string;
    readonly firm: string;
    readonly firmValue: string;
    readonly key: string;
    readonly label: string;
    readonly latestPurchase: string;
    readonly memberAccountIds: readonly string[];
    readonly memberCount: number;
}

interface NextRoundEligibility {
    readonly firm: TradingFirm;
    readonly leftOutLabels: readonly string[];
    readonly payoutsCents: number;
    readonly plan: Plan;
    readonly planReference: BankrollPlanReference;
    readonly round: LedgerRoundRow;
    readonly spendCents: number;
}

export function firmColumnsFromSelectValue(value: string): FirmColumns | null {
    const separatorIndex = value.indexOf(':');
    if (separatorIndex === -1) return null;
    const kind = value.slice(0, separatorIndex);
    const id = value.slice(separatorIndex + 1);
    if (kind === (FirmKeyKind.Modeled as string)) {
        const firmId = parseFirmId(id);
        return firmId === undefined ? null : { externalFirmId: null, firmId };
    }
    return kind === (FirmKeyKind.External as string)
        ? { externalFirmId: id, firmId: null }
        : null;
}

export function firmSelectOptions(
    externalFirms: readonly ExternalFirmName[],
): readonly FirmSelectOption[] {
    const modeled = ALL_FIRMS.map((firm) => ({
        label: firm.displayName,
        value: firmKeyId({ firmId: firm.id, kind: FirmKeyKind.Modeled }),
    }));
    const own = externalFirms
        .toSorted((a, b) => compareText(a.name, b.name))
        .map((firm) => ({
            label: firm.name,
            value: firmKeyId({
                externalFirmId: firm.id,
                kind: FirmKeyKind.External,
            }),
        }));
    return [...modeled, ...own];
}

export function nextRoundCardModelOf(
    inputs: NextRoundCardInputs,
): NextRoundCardModel | null {
    const { availableCents, ledger, rulebook, runId, today, trades } = inputs;
    const round = mostRecentlyClosedRound(ledger);
    if (round === null) return null;
    const eligibility = nextRoundEligibilityOf(ledger, round);
    if (eligibility === null) return null;

    const cycle = roundCycle(ledger, rulebook.samples);
    const measuredCycleDays =
        cycle.sampleLevel === SampleLevel.Adequate && cycle.cycleDays !== null
            ? cycle.cycleDays.value
            : null;
    const dayBudget =
        measuredCycleDays === null
            ? DEFAULT_MAX_EVAL_DAYS + DEFAULT_FUNDED_HORIZON_DAYS
            : Math.max(1, Math.round(measuredCycleDays));

    const { optionACents, optionBCents } = nextRoundBudgetsCents(
        eligibility,
        availableCents,
    );
    const capacity = rulebook.bankroll.dailyAccountCapacity;
    const measuredRebuyLag = measuredRebuyLagFromStats(
        replacementStats(ledger),
        eligibility.planReference.planSerial,
    );
    const request: NextRoundToolsRequest = {
        dayBudget,
        kind: ToolsRequestKind.NextRound,
        optionA: nextRoundBankrollPolicy(optionACents, capacity),
        optionB: nextRoundBankrollPolicy(optionBCents, capacity),
        runId,
        trials: NEXT_ROUND_TRIALS,
        variant: nextRoundVariantFor(eligibility, rulebook, measuredRebuyLag),
    };

    const scaleGate = scaleGateFromLedger(
        ledger,
        today,
        rulebook.samples,
        trades,
    );

    const realizedPassRate = realizedOutcomes(ledger).perPlan.find(
        (plan) =>
            plan.firmId === eligibility.planReference.firmId &&
            plan.planSerial === eligibility.planReference.planSerial,
    )?.passRate;

    return {
        leftOutLabels: eligibility.leftOutLabels,
        measuredCycleDays,
        modeledRr: rulebook.strategy.rr,
        modeledWinrate: rulebook.strategy.winrate,
        planLabel: `${eligibility.firm.displayName} ${formatUsdCents(usdCentsFromDollars(eligibility.plan.accountSize))}`,
        realizedPassRate:
            realizedPassRate == null
                ? null
                : { n: realizedPassRate.n, value: realizedPassRate.value },
        rebuyLagNote: rebuyLagNoteOf(measuredRebuyLag),
        request,
        roundId: eligibility.round.id,
        roundLabel: eligibility.round.label,
        scaleGate,
    };
}

export function nextRoundResultSummaryOf(
    inputs: NextRoundResultInputs,
): NextRoundResultSummary {
    const {
        dayBudget,
        optionABudget,
        optionAResult,
        optionBBudget,
        optionBResult,
        scaleGate,
    } = inputs;
    const optionA = nextRoundOptionSummary(
        optionAResult,
        dayBudget,
        optionABudget,
        null,
    );
    const optionB = nextRoundOptionSummary(
        optionBResult,
        dayBudget,
        optionBBudget,
        scaleGateNoteFor(scaleGate),
    );
    const recommended =
        scaleGate.status === ScaleGateStatus.Ready &&
        medianMonthlyNetOf(optionBResult, dayBudget) >
            medianMonthlyNetOf(optionAResult, dayBudget)
            ? NextRoundRecommendation.OptionB
            : NextRoundRecommendation.OptionA;
    return { optionA, optionB, recommended };
}

export function roundsPageModel(
    ledger: PortfolioLedger,
    sampleThresholds: SampleThresholds,
    roundGapDays: number,
    firms: readonly ExternalFirmName[],
    today: string,
): RoundsPageModel {
    const poolNetValuesDollars = perAttemptNetCents(
        ledger,
        today,
        DEFAULT_REALIZED_HORIZON_DAYS,
    ).map((cents) => cents / 100);
    const result = roundReturns({
        draws: ROUNDS_BOOTSTRAP_DRAWS,
        ledger,
        poolNetValuesDollars,
        sampleThresholds,
        seed: ROUNDS_BOOTSTRAP_SEED,
    });
    const roundedAccountIds = new Set(
        ledger.accounts
            .filter((entry) => entry.row.roundId != null)
            .map((entry) => entry.row.id),
    );
    const candidates = ledger.accounts
        .filter((entry) => !roundedAccountIds.has(entry.row.id))
        .map((entry) => ({
            accountId: entry.row.id,
            firmKey: firmKeyOf(entry.row),
            purchasedOn: entry.row.purchasedOn,
        }));
    return {
        perFirm: result.perFirm.map((row) => roundFirmSummaryRow(row, firms)),
        rounds: result.rounds
            .toSorted(
                (a, b) =>
                    compareText(b.openedOn, a.openedOn) ||
                    compareText(a.label, b.label),
            )
            .map((row) => roundRow(row, firms)),
        suggestions: roundSuggestions(candidates, roundGapDays).map((row) =>
            roundSuggestionRow(row, firms),
        ),
        unassignedRoundCount: result.unassignedRoundCount,
    };
}

function formatCycleDays(days: null | number): string {
    if (days === null) return NOT_APPLICABLE;
    return `${String(days)} day${days === 1 ? '' : 's'}`;
}

function formatMultiple(value: null | number): string {
    return value === null ? NOT_APPLICABLE : `${value.toFixed(2)}x`;
}

function formatSharePositive(share: null | SampledEstimate): string {
    if (share === null) return NOT_APPLICABLE;
    const intervalText =
        share.interval === null
            ? ''
            : `95% CI ${formatPercent(share.interval.lower)} to ${formatPercent(share.interval.upper)}, `;
    return `${formatPercent(share.value)} (${intervalText}n = ${String(share.n)})`;
}

function medianMonthlyNetOf(
    result: BankrollTimelineResult,
    dayBudget: number,
): number {
    const lastIndex = result.days.length - 1;
    const start = result.cashP50[0] ?? 0;
    const end = result.cashP50[lastIndex] ?? 0;
    return dayBudget > 0
        ? ((end - start) / dayBudget) * TRADING_DAYS_PER_MONTH
        : 0;
}

function mostRecentlyClosedRound(
    ledger: PortfolioLedger,
): LedgerRoundRow | null {
    const closed = ledger.rounds
        .filter((row) => row.status === RoundStatus.Closed)
        .toSorted((a, b) => compareText(b.closedOn ?? '', a.closedOn ?? ''));
    return closed[0] ?? null;
}

function nextRoundBankrollPolicy(
    cents: number,
    capacity: null | number,
): BankrollPolicy {
    return {
        maxConcurrentAccounts: capacity,
        monthlyBudget: null,
        payoutLagDays: 0,
        reinvestFraction: fraction(0),
        roundBudget: null,
        startingBankroll: dollars(cents / CENTS_PER_DOLLAR),
    };
}

function nextRoundBudgetsCents(
    eligibility: NextRoundEligibility,
    availableCents: null | number,
): { readonly optionACents: number; readonly optionBCents: number } {
    const optionACents = eligibility.spendCents;
    const combinedCents = eligibility.spendCents + eligibility.payoutsCents;
    const optionBCents =
        availableCents === null
            ? optionACents
            : Math.min(combinedCents, Math.max(availableCents, 0));
    return { optionACents, optionBCents };
}

function nextRoundEligibilityOf(
    ledger: PortfolioLedger,
    round: LedgerRoundRow,
): NextRoundEligibility | null {
    const resolvedMembers = ledger.resolvedAccounts.filter(
        (entry) => accountRoundId(entry) === round.id,
    );
    const [resolved] = resolvedMembers;
    if (resolved?.plan == null) return null;
    const isSinglePlan = resolvedMembers.every(
        (entry) => entry.plan?.planSerial === resolved.plan?.planSerial,
    );
    if (!isSinglePlan) return null;
    const cash = summarizeCash(
        resolvedMembers.flatMap((entry) => entry.fees),
        resolvedMembers.flatMap((entry) => entry.payouts),
    );
    const checkedIds = new Set(resolvedMembers.map((entry) => entry.row.id));
    const leftOutLabels = ledger
        .membersOfRound(round.id)
        .filter((entry) => !checkedIds.has(entry.row.id))
        .map((entry) => entry.row.label);
    return {
        firm: resolved.plan.firm,
        leftOutLabels,
        payoutsCents: cash.payouts,
        plan: resolved.plan.plan,
        planReference: planReferenceOf(
            resolved.plan.plan,
            normalizedPlanOptIns(resolved.row.optIns),
        ),
        round,
        spendCents: cash.spend,
    };
}

function nextRoundOptionSummary(
    result: BankrollTimelineResult,
    dayBudget: number,
    startingBankroll: number,
    scaleGateNote: null | string,
): NextRoundOptionSummary {
    return {
        medianMonthlyNet: formatUsdCents(
            usdCentsFromDollars(medianMonthlyNetOf(result, dayBudget)),
        ),
        pathRuin: `${(result.pathRuin * 100).toFixed(1)}%`,
        pRoundNetNegative: `${(result.pFinalNetNegative * 100).toFixed(1)}%`,
        scaleGateNote,
        startingBankroll: formatUsdCents(usdCentsFromDollars(startingBankroll)),
    };
}

function nextRoundVariantFor(
    eligibility: NextRoundEligibility,
    rulebook: RulebookParameters,
    measuredRebuyLag: MeasuredRebuyLag | null,
): BankrollPlanVariantInputs {
    const { policy: builtPolicy } = buildEnginePolicy({
        accountPolicy: findFirm(eligibility.plan.id.firm)?.accountPolicy,
        fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
        measuredRebuyLag,
        plan: eligibility.plan,
        positionSizing: null,
        rulebook,
    });
    const policy: EnginePolicy = enginePolicySchema.parse({
        ...builtPolicy,
        payoutRequestOverride: rulebook.payout.requestCents / CENTS_PER_DOLLAR,
    });
    return {
        base: {
            fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
            maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
            riskPerTrade: rulebook.funded.riskCents / CENTS_PER_DOLLAR,
            rrRatio: rulebook.strategy.rr,
            seed: ROUNDS_BOOTSTRAP_SEED,
            tradesPerDay: rulebook.funded.tradesPerDayMax,
            trials: NEXT_ROUND_TRIALS,
            winrate: rulebook.strategy.winrate,
        },
        plan: eligibility.planReference,
        policy,
    };
}

function normalizedPlanOptIns(raw: Partial<PlanOptIns>): PlanOptIns {
    return {
        takesFundedReset: raw.takesFundedReset === true,
        takesOneTimeEarlyWithdrawal: raw.takesOneTimeEarlyWithdrawal === true,
    };
}

function rebuyLagNoteOf(measuredRebuyLag: MeasuredRebuyLag | null): string {
    return measuredRebuyLag === null
        ? 'Rebuy lag: assumed zero, because no replacement on this plan has been measured.'
        : `Rebuy lag: ${measuredRebuyLag.days.toFixed(1)} sessions on this plan, measured from ${String(measuredRebuyLag.samples)} of your replacements.`;
}

function roundFirmSummaryRow(
    row: RoundFirmSummary,
    firms: readonly ExternalFirmName[],
): RoundFirmSummaryRow {
    return {
        closedRounds: String(row.closedRounds),
        firm: firmKeyLabel(row.firmKey, firms),
        key: firmKeyId(row.firmKey),
        max: formatMultiple(row.max),
        mean: formatMultiple(row.mean),
        min: formatMultiple(row.min),
        rounds: String(row.rounds),
        sampleLevel: row.sampleLevel,
        sharePositive: formatSharePositive(row.sharePositive),
    };
}

function roundRow(
    round: RoundReturn,
    firms: readonly ExternalFirmName[],
): RoundRow {
    const { budget } = round;
    return {
        budgetPercentUsed:
            budget.budgetCents === null || budget.budgetCents === 0
                ? null
                : Math.min(100, (budget.spentCents / budget.budgetCents) * 100),
        budgetText:
            budget.budgetCents === null
                ? `${formatUsdCents(usdCents(budget.spentCents))} spent (no budget set)`
                : `${formatUsdCents(usdCents(budget.spentCents))} of ${formatUsdCents(usdCents(budget.budgetCents))}`,
        closedOn: round.closedOn,
        cycleDays: formatCycleDays(round.cycleDays),
        firm:
            round.firmKey === null
                ? NOT_APPLICABLE
                : firmKeyLabel(round.firmKey, firms),
        id: round.id,
        inProgressText:
            round.openMemberCount === 0
                ? 'none'
                : `${String(round.openMemberCount)} in progress`,
        label: round.label,
        likeThisEndsNetNegativeClosedForm:
            round.likeThisEndsNetNegativeClosedForm === null
                ? NOT_APPLICABLE
                : `${(round.likeThisEndsNetNegativeClosedForm * 100).toFixed(1)}%`,
        likeThisEndsNetNegativeModeled:
            round.likeThisEndsNetNegative === null
                ? NOT_APPLICABLE
                : `${(round.likeThisEndsNetNegative.value.value * 100).toFixed(1)}% (bootstrap estimate over ${round.likeThisEndsNetNegative.attempts} attempt${round.likeThisEndsNetNegative.attempts === 1 ? '' : 's'}, ${round.likeThisEndsNetNegative.value.n} resamples)`,
        netCents: formatUsdCents(usdCents(round.netCents)),
        openedOn: round.openedOn,
        openMemberCount: round.openMemberCount,
        ownOutcomeNetNegative: round.ownOutcomeNetNegative,
        payoutsCents: formatUsdCents(usdCents(round.payoutsCents)),
        realizedMultiple: formatMultiple(round.realizedMultiple?.value ?? null),
        status: round.status,
        statusLabel: roundStatusLabel(round.status),
        toDateMultiple: formatMultiple(round.toDateMultiple),
    };
}

function roundSuggestionRow(
    suggestion: RoundSuggestion,
    firms: readonly ExternalFirmName[],
): RoundSuggestionRow {
    return {
        earliestPurchase: suggestion.earliestPurchase,
        firm: firmKeyLabel(suggestion.firmKey, firms),
        firmValue: firmKeyId(suggestion.firmKey),
        key: `${firmKeyId(suggestion.firmKey)}-${suggestion.earliestPurchase}`,
        label: `${firmKeyLabel(suggestion.firmKey, firms)} ${suggestion.earliestPurchase}`,
        latestPurchase: suggestion.latestPurchase,
        memberAccountIds: suggestion.memberAccountIds,
        memberCount: suggestion.memberAccountIds.length,
    };
}

function scaleGateNoteFor(scaleGate: ScaleGate): null | string {
    switch (scaleGate.status) {
        case ScaleGateStatus.NotEnoughSample:
        case ScaleGateStatus.NotPositiveAfterCost: {
            return NEXT_ROUND_SCALE_GATE_NOT_READY_TEXT;
        }
        case ScaleGateStatus.Ready: {
            return null;
        }
        case ScaleGateStatus.ThresholdsNotSet: {
            return NEXT_ROUND_SCALE_GATE_THRESHOLDS_NOT_SET_TEXT;
        }
    }
}
