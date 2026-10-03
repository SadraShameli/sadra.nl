import {
    buildSizingAdvisor,
    personalAdvisorOptionsOf,
    SizingAdvisorBuildKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { type ViolationFormValues } from '~/app/(app)/prop-calculator/accounts/_components/detail/violationForm';
import { type SnapshotFieldIssue } from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import {
    snapshotPlausibilityIssues,
    type SnapshotPlausibilityMessages,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotPlausibilityIssues';
import {
    type AccountReadIssue,
    type AccountStage,
    AccountStatus,
    AccountTracking,
    compareText,
    type DashboardBalanceConvention,
    describeAccountReadIssue,
    missingSnapshotFields,
    optionalDollars,
    personalMaxRiskOf,
    type PersonalRules,
    type PlanKeyInput,
    PlanKeyResolutionKind,
    resolvePlanKey,
    RuleViolationKind,
    type SnapshotEntryAccount,
    type SnapshotEntryValues,
    SnapshotField,
    type SnapshotFieldRule,
    snapshotFieldRules,
    type StoredFirmId,
    TradingSessionCalendar,
    usdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import { isActualRiskAboveAccepted } from '~/lib/prop-accounts/conduct';
import {
    type AdherenceDecision,
    type DecisionAdherence,
    decisionAdherenceOf,
    isDecisionFollowed,
} from '~/lib/prop-accounts/metrics';
import { type Plan, type PlanOptIns } from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountReconstructionError,
    type AccountSnapshotInput,
    AdviceStalenessKind,
    documentedRuleLabel,
    NO_PENDING_PAYOUT_COUNTS,
    rulebookDeviation,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { MAX_ACCEPTED_RUNGS } from '~/lib/schemas/propAccounts';

export enum DecisionAdherenceKind {
    Followed = 'followed',
    NotFollowed = 'not-followed',
    NotRecorded = 'not-recorded',
}

export enum ViolationOfferKind {
    AlreadyLogged = 'already-logged',
    Available = 'available',
    None = 'none',
}

export enum WeeklyReviewEntryKind {
    AlreadyRecorded = 'already-recorded',
    Edited = 'edited',
    NoPrevious = 'no-previous',
    Unchanged = 'unchanged',
}

export enum WeeklyReviewSizingKind {
    NoEvalAdvice = 'no-eval-advice',
    NotModeled = 'not-modeled',
    Ready = 'ready',
    ReconstructionFailed = 'reconstruction-failed',
    Stale = 'stale',
}

export interface WeeklyReviewAccountInput {
    readonly accountSize: number;
    readonly dashboardConvention: DashboardBalanceConvention;
    readonly firmId: null | StoredFirmId;
    readonly id: string;
    readonly label: string;
    readonly liveStartBalanceCents: null | number;
    readonly optIns: PlanOptIns;
    readonly personalRules: null | PersonalRules;
    readonly planSerial: null | string;
    readonly readIssues: readonly AccountReadIssue[];
    readonly stage: AccountStage;
    readonly status: AccountStatus;
    readonly tracking: AccountTracking;
}

export interface WeeklyReviewCorruptRow {
    readonly accountId: string;
    readonly label: string;
    readonly reasons: readonly string[];
}

export interface WeeklyReviewDecisionRow {
    readonly acceptedRiskCents: number;
    readonly actualRiskCents: null | number;
    readonly decidedOn: string;
    readonly id: string;
}

export interface WeeklyReviewDecisionSubmitEntry {
    readonly acceptedRiskCents: number;
    readonly acceptedRungsCents: readonly number[];
    readonly accountId: string;
    readonly headlineRiskCents: number;
    readonly stage: AccountStage;
}

export type WeeklyReviewDraft = Partial<WeeklyReviewSnapshotValues>;

export interface WeeklyReviewLastDecision {
    readonly acceptedRiskCents: number;
    readonly actualRiskCents: null | number;
    readonly adherence: DecisionAdherenceKind;
    readonly decidedOn: string;
    readonly id: string;
    readonly isAboveAccepted: boolean;
    readonly isViolationLogged: boolean;
}

export interface WeeklyReviewModelInput {
    readonly accounts: readonly WeeklyReviewAccountInput[];
    readonly confirmedUnchanged: ReadonlySet<string>;
    readonly drafts: ReadonlyMap<string, WeeklyReviewDraft>;
    readonly invalidEntries: ReadonlyMap<string, readonly SnapshotFieldIssue[]>;
    readonly latestDecisions: ReadonlyMap<string, WeeklyReviewDecisionRow>;
    readonly latestSnapshots: ReadonlyMap<string, WeeklyReviewSnapshotRow>;
    readonly rulebook: RulebookParameters;
    readonly stagesOnAsOf: ReadonlyMap<string, AccountStage>;
    readonly today: string;
    readonly violations: readonly WeeklyReviewViolationRow[];
}

export interface WeeklyReviewResult {
    readonly adherence: DecisionAdherence;
    readonly adherenceStepCents: number;
    readonly asOf: string;
    readonly corruptRows: readonly WeeklyReviewCorruptRow[];
    readonly ledgerOnlyExcludedCount: number;
    readonly notUpdatedCount: number;
    readonly rows: readonly WeeklyReviewRow[];
    readonly weekStart: string;
    readonly windowEnd: string;
}

export interface WeeklyReviewRow {
    readonly accountId: string;
    readonly asOf: string;
    readonly blockedMessages: readonly string[];
    readonly diffCents: null | number;
    readonly draft: WeeklyReviewSnapshotValues;
    readonly entryKind: WeeklyReviewEntryKind;
    readonly fieldWarnings: readonly SnapshotFieldIssue[];
    readonly formWarnings: readonly string[];
    readonly isBlocked: boolean;
    readonly isRecorded: boolean;
    readonly label: string;
    readonly lastDecision: null | WeeklyReviewLastDecision;
    readonly missingFieldLabels: readonly string[];
    readonly parseIssues: readonly SnapshotFieldIssue[];
    readonly previousAcceptedRiskCents: null | number;
    readonly sizing: WeeklyReviewSizing;
    readonly stage: AccountStage;
    readonly stageOnAsOf: AccountStage;
    readonly unchangedSince: null | string;
    readonly violationOffer: WeeklyReviewViolationOffer;
    readonly violations: readonly WeeklyReviewViolationRow[];
}

export type WeeklyReviewSizing =
    | {
          readonly headlineLabel: string;
          readonly headlineRiskCents: number;
          readonly kind: WeeklyReviewSizingKind.Ready;
          readonly rungsCents: readonly number[];
      }
    | { readonly kind: WeeklyReviewSizingKind.NoEvalAdvice }
    | { readonly kind: WeeklyReviewSizingKind.NotModeled }
    | { readonly kind: WeeklyReviewSizingKind.ReconstructionFailed }
    | { readonly kind: WeeklyReviewSizingKind.Stale };

export interface WeeklyReviewSnapshotRow extends WeeklyReviewSnapshotValues {
    readonly asOf: string;
}

export interface WeeklyReviewSnapshotSubmitEntry extends Omit<
    WeeklyReviewSnapshotValues,
    'balanceCents'
> {
    readonly accountId: string;
    readonly balanceCents: number;
}

export interface WeeklyReviewSnapshotValues {
    readonly balanceAtLastPayoutCents: null | number;
    readonly balanceCents: null | number;
    readonly cumulativePayoutCents: null | number;
    readonly cycleBestDayProfitCents: null | number;
    readonly dashboardFloorCents: null | number;
    readonly evalBestDayProfitCents: null | number;
    readonly floorAtLastPayoutCents: null | number;
    readonly highestEodBalanceCents: null | number;
    readonly highestIntradayBalanceCents: null | number;
    readonly lastPayoutOn: null | string;
    readonly lastTradedOn: null | string;
    readonly payoutsTaken: null | number;
    readonly qualifyingDaysSinceLastPayout: null | number;
    readonly tradingDays: null | number;
}

export interface WeeklyReviewSubmitPayload {
    readonly asOf: string;
    readonly decisions: readonly WeeklyReviewDecisionSubmitEntry[];
    readonly snapshots: readonly WeeklyReviewSnapshotSubmitEntry[];
}

export type WeeklyReviewViolationOffer =
    | {
          readonly decision: Pick<WeeklyReviewDecisionRow, 'decidedOn' | 'id'>;
          readonly initial: ViolationFormValues;
          readonly kind: ViolationOfferKind.Available;
      }
    | { readonly kind: ViolationOfferKind.AlreadyLogged }
    | { readonly kind: ViolationOfferKind.None };

export interface WeeklyReviewViolationRow {
    readonly accountId: string;
    readonly costCents: null | number;
    readonly decisionId: null | string;
    readonly id: string;
    readonly kind: RuleViolationKind;
    readonly note: null | string;
    readonly occurredOn: string;
}

export interface WeeklyReviewWindow {
    readonly asOf: string;
    readonly weekStart: string;
}

const WEEK_DAYS = 7;

const DOCUMENTED_HEADLINE_LABEL = 'Documented headline';

interface ReviewEntry {
    readonly draft: WeeklyReviewSnapshotValues;
    readonly entryKind: WeeklyReviewEntryKind;
    readonly isInvalid: boolean;
    readonly parseIssues: readonly SnapshotFieldIssue[];
    readonly sizedAsOf: string;
    readonly unchangedSince: null | string;
}

const EMPTY_DRAFT: WeeklyReviewSnapshotValues = {
    balanceAtLastPayoutCents: null,
    balanceCents: null,
    cumulativePayoutCents: null,
    cycleBestDayProfitCents: null,
    dashboardFloorCents: null,
    evalBestDayProfitCents: null,
    floorAtLastPayoutCents: null,
    highestEodBalanceCents: null,
    highestIntradayBalanceCents: null,
    lastPayoutOn: null,
    lastTradedOn: null,
    payoutsTaken: null,
    qualifyingDaysSinceLastPayout: null,
    tradingDays: null,
};

export function buildWeeklyReview(
    input: WeeklyReviewModelInput,
): WeeklyReviewResult {
    const { asOf, weekStart } = weeklyReviewWindowOf(
        input.today,
        input.rulebook,
    );
    const stepCents = input.rulebook.eval.roundingStepCents;
    const corruptRows: WeeklyReviewCorruptRow[] = [];
    const rows: WeeklyReviewRow[] = [];
    for (const account of input.accounts) {
        if (!isReviewedAccount(account)) continue;
        if (account.readIssues.length > 0) {
            corruptRows.push({
                accountId: account.id,
                label: account.label,
                reasons: account.readIssues.map((issue) =>
                    describeAccountReadIssue(planKeyOf(account), issue),
                ),
            });
            continue;
        }
        rows.push(reviewRowFor(account, asOf, weekStart, input));
    }
    return {
        adherence: adherenceOf(rows, stepCents),
        adherenceStepCents: stepCents,
        asOf,
        corruptRows,
        ledgerOnlyExcludedCount:
            input.accounts.filter(isActiveLedgerOnly).length,
        notUpdatedCount: rows.filter(isNotUpdated).length,
        rows,
        weekStart,
        windowEnd: input.today,
    };
}

export function planOf(account: WeeklyReviewAccountInput): null | Plan {
    if (
        account.tracking !== AccountTracking.Modeled ||
        account.firmId === null ||
        account.planSerial === null
    ) {
        return null;
    }
    const resolution = resolvePlanKey(planKeyOf(account));
    return resolution.kind === PlanKeyResolutionKind.Resolved
        ? resolution.plan
        : null;
}

export function reviewSubmitPayload(
    result: WeeklyReviewResult,
    acceptedAccountIds: ReadonlySet<string>,
): WeeklyReviewSubmitPayload {
    const recorded = result.rows.filter((row) => row.isRecorded);
    return {
        asOf: result.asOf,
        decisions: recorded.flatMap((row) =>
            decisionEntryFor(row, acceptedAccountIds),
        ),
        snapshots: recorded.map(submitEntryFor),
    };
}

export function violationsFromOf(
    input: Pick<
        WeeklyReviewModelInput,
        'accounts' | 'latestDecisions' | 'rulebook' | 'today'
    >,
): string {
    const { weekStart } = weeklyReviewWindowOf(input.today, input.rulebook);
    let earliest = weekStart;
    for (const account of input.accounts) {
        if (!isReviewedAccount(account) || account.readIssues.length > 0) {
            continue;
        }
        const decision = input.latestDecisions.get(account.id);
        if (decision === undefined) continue;
        const lastDecision = lastDecisionOf(
            account.id,
            decision,
            [],
            input.rulebook.eval.roundingStepCents,
        );
        if (
            isViolationOfferable(lastDecision) &&
            compareText(decision.decidedOn, earliest) < 0
        ) {
            earliest = decision.decidedOn;
        }
    }
    return earliest;
}

export function weeklyReviewWindowOf(
    today: string,
    rulebook: RulebookParameters,
): WeeklyReviewWindow {
    const asOf = TradingSessionCalendar.latestWeekdayOnOrBefore(
        today,
        rulebook.review.weekday,
    );
    return {
        asOf,
        weekStart: TradingSessionCalendar.addDays(asOf, 1 - WEEK_DAYS),
    };
}

function adherenceDecisionOf(
    accountId: string,
    decision: Pick<
        WeeklyReviewDecisionRow,
        'acceptedRiskCents' | 'actualRiskCents' | 'decidedOn'
    >,
): AdherenceDecision {
    return {
        acceptedRiskCents: usdCents(decision.acceptedRiskCents),
        accountId,
        actualRiskCents: brandedCentsOrNull(decision.actualRiskCents),
        decidedOn: decision.decidedOn,
    };
}

function adherenceKindOf(
    accountId: string,
    decision: WeeklyReviewDecisionRow,
    stepCents: number,
): DecisionAdherenceKind {
    const verdict = isDecisionFollowed(
        adherenceDecisionOf(accountId, decision),
        stepCents,
    );
    if (verdict === null) return DecisionAdherenceKind.NotRecorded;
    return verdict
        ? DecisionAdherenceKind.Followed
        : DecisionAdherenceKind.NotFollowed;
}

function adherenceOf(
    rows: readonly WeeklyReviewRow[],
    stepCents: number,
): DecisionAdherence {
    return decisionAdherenceOf(
        rows.flatMap((row) =>
            row.lastDecision === null
                ? []
                : [adherenceDecisionOf(row.accountId, row.lastDecision)],
        ),
        stepCents,
    );
}

function brandedCentsOrNull(cents: null | number) {
    return cents === null ? null : usdCents(cents);
}

function decisionEntryFor(
    row: WeeklyReviewRow,
    acceptedAccountIds: ReadonlySet<string>,
): readonly WeeklyReviewDecisionSubmitEntry[] {
    if (row.sizing.kind !== WeeklyReviewSizingKind.Ready) return [];
    if (!acceptedAccountIds.has(row.accountId)) return [];
    return [
        {
            acceptedRiskCents: row.sizing.headlineRiskCents,
            acceptedRungsCents: row.sizing.rungsCents,
            accountId: row.accountId,
            headlineRiskCents: row.sizing.headlineRiskCents,
            stage: row.stage,
        },
    ];
}

function entryOf(
    account: WeeklyReviewAccountInput,
    asOf: string,
    input: WeeklyReviewModelInput,
): ReviewEntry {
    const invalidIssues = input.invalidEntries.get(account.id);
    if (invalidIssues !== undefined) {
        return {
            draft: EMPTY_DRAFT,
            entryKind: WeeklyReviewEntryKind.Edited,
            isInvalid: true,
            parseIssues: invalidIssues,
            sizedAsOf: asOf,
            unchangedSince: null,
        };
    }
    const edited = input.drafts.get(account.id);
    if (edited !== undefined) {
        return {
            draft: materialize(edited),
            entryKind: WeeklyReviewEntryKind.Edited,
            isInvalid: false,
            parseIssues: [],
            sizedAsOf: asOf,
            unchangedSince: null,
        };
    }
    const previous = input.latestSnapshots.get(account.id);
    if (previous === undefined) {
        return {
            draft: EMPTY_DRAFT,
            entryKind: WeeklyReviewEntryKind.NoPrevious,
            isInvalid: false,
            parseIssues: [],
            sizedAsOf: asOf,
            unchangedSince: null,
        };
    }
    const isAlreadyRecorded = compareText(previous.asOf, asOf) >= 0;
    return {
        draft: materialize(previous),
        entryKind: isAlreadyRecorded
            ? WeeklyReviewEntryKind.AlreadyRecorded
            : WeeklyReviewEntryKind.Unchanged,
        isInvalid: false,
        parseIssues: [],
        sizedAsOf: previous.asOf,
        unchangedSince: isAlreadyRecorded ? null : previous.asOf,
    };
}

function headlineLabelOf(rulebook: RulebookParameters): string {
    const deviation = rulebookDeviation(rulebook);
    return deviation.length === 0
        ? DOCUMENTED_HEADLINE_LABEL
        : `Headline from ${documentedRuleLabel(deviation)}`;
}

function isActiveLedgerOnly(account: WeeklyReviewAccountInput): boolean {
    return (
        account.status === AccountStatus.Active &&
        account.tracking === AccountTracking.LedgerOnly
    );
}

function isFieldFilled(
    snapshot: WeeklyReviewSnapshotValues,
    field: SnapshotField,
): boolean {
    switch (field) {
        case SnapshotField.AsOf: {
            return true;
        }
        case SnapshotField.Balance: {
            return snapshot.balanceCents !== null;
        }
        case SnapshotField.BalanceAtLastPayout: {
            return snapshot.balanceAtLastPayoutCents !== null;
        }
        case SnapshotField.CumulativePayout: {
            return snapshot.cumulativePayoutCents !== null;
        }
        case SnapshotField.CycleBestDayProfit: {
            return snapshot.cycleBestDayProfitCents !== null;
        }
        case SnapshotField.DashboardFloor: {
            return snapshot.dashboardFloorCents !== null;
        }
        case SnapshotField.EvalBestDayProfit: {
            return snapshot.evalBestDayProfitCents !== null;
        }
        case SnapshotField.FloorAtLastPayout: {
            return snapshot.floorAtLastPayoutCents !== null;
        }
        case SnapshotField.HighestEodBalance: {
            return snapshot.highestEodBalanceCents !== null;
        }
        case SnapshotField.HighestIntradayBalance: {
            return snapshot.highestIntradayBalanceCents !== null;
        }
        case SnapshotField.LastPayoutOn: {
            return snapshot.lastPayoutOn !== null;
        }
        case SnapshotField.LastTradedOn: {
            return snapshot.lastTradedOn !== null;
        }
        case SnapshotField.PayoutsTaken: {
            return snapshot.payoutsTaken !== null;
        }
        case SnapshotField.QualifyingDaysSinceLastPayout: {
            return snapshot.qualifyingDaysSinceLastPayout !== null;
        }
        case SnapshotField.TradingDays: {
            return snapshot.tradingDays !== null;
        }
    }
}

function isNotUpdated(row: WeeklyReviewRow): boolean {
    return (
        (row.entryKind === WeeklyReviewEntryKind.NoPrevious ||
            row.entryKind === WeeklyReviewEntryKind.Unchanged) &&
        !row.isRecorded
    );
}

function isReviewedAccount(account: WeeklyReviewAccountInput): boolean {
    return (
        account.status === AccountStatus.Active &&
        account.tracking === AccountTracking.Modeled
    );
}

function isViolationOfferable(
    decision: Pick<WeeklyReviewLastDecision, 'adherence' | 'isAboveAccepted'>,
): boolean {
    return (
        decision.adherence === DecisionAdherenceKind.NotFollowed &&
        decision.isAboveAccepted
    );
}

function lastDecisionOf(
    accountId: string,
    decision: WeeklyReviewDecisionRow,
    violations: readonly WeeklyReviewViolationRow[],
    stepCents: number,
): WeeklyReviewLastDecision {
    return {
        acceptedRiskCents: decision.acceptedRiskCents,
        actualRiskCents: decision.actualRiskCents,
        adherence: adherenceKindOf(accountId, decision, stepCents),
        decidedOn: decision.decidedOn,
        id: decision.id,
        isAboveAccepted: isActualRiskAboveAccepted(
            adherenceDecisionOf(accountId, decision),
        ),
        isViolationLogged: violations.some(
            (violation) => violation.decisionId === decision.id,
        ),
    };
}

function materialize(draft: WeeklyReviewDraft): WeeklyReviewSnapshotValues {
    return {
        balanceAtLastPayoutCents: draft.balanceAtLastPayoutCents ?? null,
        balanceCents: draft.balanceCents ?? null,
        cumulativePayoutCents: draft.cumulativePayoutCents ?? null,
        cycleBestDayProfitCents: draft.cycleBestDayProfitCents ?? null,
        dashboardFloorCents: draft.dashboardFloorCents ?? null,
        evalBestDayProfitCents: draft.evalBestDayProfitCents ?? null,
        floorAtLastPayoutCents: draft.floorAtLastPayoutCents ?? null,
        highestEodBalanceCents: draft.highestEodBalanceCents ?? null,
        highestIntradayBalanceCents: draft.highestIntradayBalanceCents ?? null,
        lastPayoutOn: draft.lastPayoutOn ?? null,
        lastTradedOn: draft.lastTradedOn ?? null,
        payoutsTaken: draft.payoutsTaken ?? null,
        qualifyingDaysSinceLastPayout:
            draft.qualifyingDaysSinceLastPayout ?? null,
        tradingDays: draft.tradingDays ?? null,
    };
}

function missingFieldLabelsFor(
    rules: readonly SnapshotFieldRule[],
    snapshot: WeeklyReviewSnapshotValues,
): readonly string[] {
    const missing = missingSnapshotFields(rules, (field) =>
        isFieldFilled(snapshot, field),
    );
    return [
        ...new Set(
            missing.map((field) =>
                field.alternative === null
                    ? field.label
                    : `${field.label} or ${field.alternative.label}`,
            ),
        ),
    ];
}

function planKeyOf(account: WeeklyReviewAccountInput): PlanKeyInput {
    return { ...planKeyTextOf(account), readIssues: account.readIssues };
}

function planKeyTextOf(
    account: WeeklyReviewAccountInput,
): Omit<PlanKeyInput, 'readIssues'> {
    if (account.firmId === null || account.planSerial === null) {
        throw new Error(
            `account ${account.id} is modeled but has no firm or plan serial`,
        );
    }
    return {
        accountSize: account.accountSize,
        firmId: account.firmId,
        optIns: account.optIns,
        planSerial: account.planSerial,
    };
}

function previousAcceptedRiskCents(
    account: WeeklyReviewAccountInput,
    plan: Plan,
    stage: AccountStage,
    input: WeeklyReviewModelInput,
): null | number {
    const decision = input.latestDecisions.get(account.id);
    if (decision !== undefined) return decision.acceptedRiskCents;
    const previous = input.latestSnapshots.get(account.id);
    if (previous === undefined) return null;
    const rules = snapshotFieldRules(plan, stage);
    if (missingFieldLabelsFor(rules, previous).length > 0) return null;
    const sizing = sizingFor(
        account,
        plan,
        stage,
        previous,
        previous.asOf,
        input,
    );
    return sizing.kind === WeeklyReviewSizingKind.Ready
        ? sizing.headlineRiskCents
        : null;
}

function resolvedPlanOf(account: WeeklyReviewAccountInput): Plan {
    const plan = planOf(account);
    if (plan === null) {
        throw new Error(
            `account ${account.id} has no read issues but its plan did not resolve`,
        );
    }
    return plan;
}

function reviewRowFor(
    account: WeeklyReviewAccountInput,
    asOf: string,
    weekStart: string,
    input: WeeklyReviewModelInput,
): WeeklyReviewRow {
    const plan = resolvedPlanOf(account);
    const stageOnAsOf = stageOnAsOfOf(account, asOf, input);
    const {
        draft,
        entryKind,
        isInvalid,
        parseIssues,
        sizedAsOf,
        unchangedSince,
    } = entryOf(account, asOf, input);
    const rules = snapshotFieldRules(plan, stageOnAsOf);
    const missingFieldLabelsList = isInvalid
        ? []
        : missingFieldLabelsFor(rules, draft);
    const accountEntry: SnapshotEntryAccount = {
        accountSize: account.accountSize,
        dashboardConvention: account.dashboardConvention,
        liveStartBalanceCents: brandedCentsOrNull(
            account.liveStartBalanceCents,
        ),
    };
    const messages: SnapshotPlausibilityMessages =
        isInvalid || missingFieldLabelsList.length > 0
            ? {
                  fieldIssues: [],
                  fieldWarnings: [],
                  formIssues: [],
                  formWarnings: [],
              }
            : snapshotPlausibilityIssues(
                  { account: accountEntry, plan, stage: stageOnAsOf },
                  toSnapshotEntryValues(draft),
              );
    const blockedMessages = [
        ...messages.formIssues,
        ...messages.fieldIssues.map((issue) => issue.message),
    ];
    const isBlocked =
        isInvalid ||
        missingFieldLabelsList.length > 0 ||
        blockedMessages.length > 0;
    const isRecorded =
        !isBlocked &&
        (entryKind === WeeklyReviewEntryKind.Edited ||
            (entryKind === WeeklyReviewEntryKind.Unchanged &&
                input.confirmedUnchanged.has(account.id)));
    const sizing = isBlocked
        ? { kind: WeeklyReviewSizingKind.NotModeled as const }
        : sizingFor(account, plan, stageOnAsOf, draft, sizedAsOf, input);
    const previousAccepted = previousAcceptedRiskCents(
        account,
        plan,
        stageOnAsOf,
        input,
    );
    const diffCents =
        previousAccepted !== null &&
        sizing.kind === WeeklyReviewSizingKind.Ready
            ? sizing.headlineRiskCents - previousAccepted
            : null;
    const latestDecision = input.latestDecisions.get(account.id);
    const lastDecision =
        latestDecision === undefined
            ? null
            : lastDecisionOf(
                  account.id,
                  latestDecision,
                  input.violations.filter(
                      (violation) => violation.accountId === account.id,
                  ),
                  input.rulebook.eval.roundingStepCents,
              );
    return {
        accountId: account.id,
        asOf,
        blockedMessages,
        diffCents,
        draft,
        entryKind,
        fieldWarnings: messages.fieldWarnings,
        formWarnings: messages.formWarnings,
        isBlocked,
        isRecorded,
        label: account.label,
        lastDecision,
        missingFieldLabels: missingFieldLabelsList,
        parseIssues,
        previousAcceptedRiskCents: previousAccepted,
        sizing,
        stage: account.stage,
        stageOnAsOf,
        unchangedSince,
        violationOffer: violationOfferFor(lastDecision),
        violations: violationsOf(
            account.id,
            weekStart,
            input.today,
            input.violations,
        ),
    };
}

function sizingFor(
    account: WeeklyReviewAccountInput,
    plan: Plan,
    stage: AccountStage,
    snapshot: WeeklyReviewSnapshotValues,
    snapshotAsOf: string,
    input: WeeklyReviewModelInput,
): WeeklyReviewSizing {
    const accountSnapshotInput: AccountSnapshotInput = {
        asOf: snapshotAsOf,
        balance: usdCentsToDollars(usdCents(snapshot.balanceCents ?? 0)),
        balanceAtLastPayout: optionalDollars(snapshot.balanceAtLastPayoutCents),
        cumulativePayout: optionalDollars(snapshot.cumulativePayoutCents),
        cycleBestDayProfit: optionalDollars(snapshot.cycleBestDayProfitCents),
        dashboardConvention: account.dashboardConvention,
        dashboardFloor: optionalDollars(snapshot.dashboardFloorCents),
        evalBestDayProfit: optionalDollars(snapshot.evalBestDayProfitCents),
        floorAtLastPayout: optionalDollars(snapshot.floorAtLastPayoutCents),
        highestEodBalance: optionalDollars(snapshot.highestEodBalanceCents),
        highestIntradayBalance: optionalDollars(
            snapshot.highestIntradayBalanceCents,
        ),
        lastPayoutOn: snapshot.lastPayoutOn ?? undefined,
        lastTradedOn: snapshot.lastTradedOn ?? undefined,
        liveStartBalance: optionalDollars(account.liveStartBalanceCents),
        payoutsTaken: snapshot.payoutsTaken ?? undefined,
        qualifyingDaysSinceLastPayout:
            snapshot.qualifyingDaysSinceLastPayout ?? undefined,
        stage,
        tradingDays: snapshot.tradingDays ?? undefined,
    };
    const personalMaxRiskPerTrade = personalMaxRiskOf(account.personalRules);
    try {
        const reconstructed = AccountReconstruction.rebuild(
            accountSnapshotInput,
            plan,
            personalMaxRiskPerTrade,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const build = buildSizingAdvisor(
            reconstructed,
            personalAdvisorOptionsOf({
                account: reconstructed,
                measuredRebuyLag: null,
                paidPayoutsSinceLastLiveAccount: null,
                personalRules: account.personalRules,
                plan,
                rulebook: input.rulebook,
                snapshotAsOf,
                status: account.status,
                today: input.today,
            }),
        );
        if (build.kind === SizingAdvisorBuildKind.NotModeled) {
            return { kind: WeeklyReviewSizingKind.NoEvalAdvice };
        }
        const { advisor } = build;
        if (advisor.staleness().kind === AdviceStalenessKind.Stale) {
            return { kind: WeeklyReviewSizingKind.Stale };
        }
        const documented = advisor.documented();
        if (documented === null) return { kind: WeeklyReviewSizingKind.Stale };
        const rungsCents = documented.rungs
            .map((rung) => usdCentsFromDollars(rung.risk))
            .filter((cents) => cents > 0)
            .slice(0, MAX_ACCEPTED_RUNGS);
        const [headlineRiskCents] = rungsCents;
        return headlineRiskCents === undefined
            ? { kind: WeeklyReviewSizingKind.ReconstructionFailed }
            : {
                  headlineLabel: headlineLabelOf(input.rulebook),
                  headlineRiskCents,
                  kind: WeeklyReviewSizingKind.Ready,
                  rungsCents,
              };
    } catch (error) {
        if (error instanceof AccountReconstructionError) {
            return { kind: WeeklyReviewSizingKind.ReconstructionFailed };
        }
        throw error;
    }
}

function stageOnAsOfOf(
    account: WeeklyReviewAccountInput,
    asOf: string,
    input: WeeklyReviewModelInput,
): AccountStage {
    const stage = input.stagesOnAsOf.get(account.id);
    if (stage === undefined) {
        throw new Error(
            `the stage account ${account.id} had on ${asOf} was not loaded`,
        );
    }
    return stage;
}

function submitEntryFor(row: WeeklyReviewRow): WeeklyReviewSnapshotSubmitEntry {
    const { balanceCents } = row.draft;
    if (balanceCents === null) {
        throw new Error(`recorded account ${row.accountId} has no balance`);
    }
    return { ...row.draft, accountId: row.accountId, balanceCents };
}

function toSnapshotEntryValues(
    snapshot: WeeklyReviewSnapshotValues,
): SnapshotEntryValues {
    if (snapshot.balanceCents === null) {
        throw new Error('a snapshot with no balance cannot be checked');
    }
    return {
        balanceAtLastPayoutCents: brandedCentsOrNull(
            snapshot.balanceAtLastPayoutCents,
        ),
        balanceCents: usdCents(snapshot.balanceCents),
        cumulativePayoutCents: brandedCentsOrNull(
            snapshot.cumulativePayoutCents,
        ),
        cycleBestDayProfitCents: brandedCentsOrNull(
            snapshot.cycleBestDayProfitCents,
        ),
        dashboardFloorCents: brandedCentsOrNull(snapshot.dashboardFloorCents),
        evalBestDayProfitCents: brandedCentsOrNull(
            snapshot.evalBestDayProfitCents,
        ),
        floorAtLastPayoutCents: brandedCentsOrNull(
            snapshot.floorAtLastPayoutCents,
        ),
        highestEodBalanceCents: brandedCentsOrNull(
            snapshot.highestEodBalanceCents,
        ),
        highestIntradayBalanceCents: brandedCentsOrNull(
            snapshot.highestIntradayBalanceCents,
        ),
        lastPayoutOn: snapshot.lastPayoutOn,
        lastTradedOn: snapshot.lastTradedOn,
        payoutsTaken: snapshot.payoutsTaken,
        qualifyingDaysSinceLastPayout: snapshot.qualifyingDaysSinceLastPayout,
        tradingDays: snapshot.tradingDays,
    };
}

function violationOfferFor(
    decision: null | WeeklyReviewLastDecision,
): WeeklyReviewViolationOffer {
    if (decision === null || !isViolationOfferable(decision)) {
        return { kind: ViolationOfferKind.None };
    }
    if (decision.isViolationLogged) {
        return { kind: ViolationOfferKind.AlreadyLogged };
    }
    return {
        decision: { decidedOn: decision.decidedOn, id: decision.id },
        initial: {
            costCents: '',
            decisionId: decision.id,
            kind: RuleViolationKind.Oversize,
            note: '',
            occurredOn: decision.decidedOn,
        },
        kind: ViolationOfferKind.Available,
    };
}

function violationsOf(
    accountId: string,
    weekStart: string,
    windowEnd: string,
    violations: readonly WeeklyReviewViolationRow[],
): readonly WeeklyReviewViolationRow[] {
    return violations
        .filter(
            (violation) =>
                violation.accountId === accountId &&
                compareText(violation.occurredOn, weekStart) >= 0 &&
                compareText(violation.occurredOn, windowEnd) <= 0,
        )
        .toSorted(
            (a, b) =>
                compareText(b.occurredOn, a.occurredOn) ||
                compareText(b.id, a.id),
        );
}
