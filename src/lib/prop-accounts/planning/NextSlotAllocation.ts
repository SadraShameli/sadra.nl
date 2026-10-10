import { formatCurrency } from '~/lib/format';
import {
    type ScaleGate,
    ScaleGateStatus,
    type ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountStage,
    dailyCapacityUnitsOf,
    type ExclusivityAccount,
    FirmEngagementStatus,
    firmKeyOf,
    isActiveAccountRow,
    purchaseBlockedFirms,
    PurchaseBlockReason,
} from '~/lib/prop-accounts/core';
import { firmEngagementFor } from '~/lib/prop-accounts/firms';
import {
    fundedSlotRoomOf,
    isFirmPolicyVerified,
    modeledEntries,
    type PooledCapPlanRow,
    pooledCapUsage,
    type PortfolioLedger,
} from '~/lib/prop-accounts/metrics';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    dollars,
    effectivePayoutRequest,
    fraction,
    LiveTriggerKind,
    type Plan,
    PolicyVerification,
    rankablePlans,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { PayoutRequestPolicy } from '~/lib/prop-calculator';
import {
    type BankrollParameters,
    type EnginePolicy,
    type FirmMinimumAboveRequestNotice,
    firmMinimumNotice,
    HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
    LifetimePayoutCapBasis,
    payoutPolicySensitivity,
    type PayoutPolicySensitivityPlanEntry,
    type PayoutPolicySensitivityRankedEntry,
    SizingObjective,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    bankrollAttemptsAt,
    bankrollNoPayoutAt,
    netPerScreenHour,
} from '~/lib/prop-calculator/economics';
import {
    type Estimate,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

export enum NextSlotEngineKind {
    Failed = 'failed',
    NotRequested = 'not-requested',
    Pending = 'pending',
    Ready = 'ready',
    Refused = 'refused',
}

export enum NextSlotExclusionReason {
    Capacity = 'capacity',
    CapScopeUnverified = 'cap-scope-unverified',
    Cooldown = 'cooldown',
    EngineFailed = 'engine-failed',
    EnginePending = 'engine-pending',
    FirmPaused = 'firm-paused',
    FirmRetired = 'firm-retired',
    LiveExclusivity = 'live-exclusivity',
    LiveTriggerDiscretionary = 'live-trigger-discretionary',
    LiveTriggerUnverified = 'live-trigger-unverified',
    NoFreeSlot = 'no-free-slot',
    NonPositiveExpectedValue = 'non-positive-expected-value',
    NotRankable = 'not-rankable',
    ScaleGateNotMet = 'scale-gate-not-met',
    Unaffordable = 'unaffordable',
}

export enum NextSlotListingKind {
    Excluded = 'excluded',
    Pending = 'pending',
    Refused = 'refused',
    Unverified = 'unverified',
}

export enum NextSlotScaleMark {
    ScaleGateNotMet = 'scale-gate-not-met',
    ThresholdsNotSet = 'thresholds-not-set',
}

export enum NextSlotSizingBasis {
    InstrumentStop = 'instrument-stop',
    Unsized = 'unsized',
}

export enum NextSlotSortKey {
    Hour = 'hour',
    Objective = 'objective',
}

export interface NextSlotAllocation {
    readonly capacity: NextSlotCapacity | null;
    readonly disclosures: readonly string[];
    readonly hardRule2MinCushion: number;
    readonly ledgerOnlyAccounts: number;
    readonly notRanked: readonly NextSlotNotRankedRow[];
    readonly objective: SizingObjective;
    readonly optimumComparable: boolean;
    readonly ranked: readonly NextSlotRankedRow[];
    readonly sortKey: NextSlotSortKey;
}

export interface NextSlotCandidate {
    readonly documented: NextSlotEngineSlot<NextSlotDocumentedFigures>;
    readonly enginePolicy: EnginePolicy;
    readonly firm: TradingFirm;
    readonly optimum: NextSlotEngineSlot<NextSlotOptimumFigures>;
    readonly plan: Plan;
}

export interface NextSlotCapacity {
    readonly activeUnits: number;
    readonly limit: number;
    readonly remaining: number;
}

export interface NextSlotDocumentedFigures {
    readonly anyPayoutGivenFundedProbability: UncertainValue;
    readonly attemptPassProbability: Estimate;
    readonly costPerAttempt: Estimate;
    readonly expectedMonthlyNet: Estimate;
    readonly expectedMonthlyRealizedNet: Estimate;
    readonly expectedNetPerAttempt: Estimate;
    readonly expectedPayoutPerFundedAccount: UncertainValue;
    readonly fundedBustProbability: Estimate;
    readonly fundedPayoutCountDistribution: readonly number[];
    readonly minRetainedCushion: number;
    readonly payoutRequestSize: number;
    readonly payoutsPerFundedAccount: UncertainValue;
    readonly trials: number;
}

export type NextSlotEngineSlot<Figures> =
    | { readonly figures: Figures; readonly kind: NextSlotEngineKind.Ready }
    | { readonly kind: NextSlotEngineKind.Failed; readonly reason: string }
    | { readonly kind: NextSlotEngineKind.NotRequested }
    | { readonly kind: NextSlotEngineKind.Pending }
    | { readonly kind: NextSlotEngineKind.Refused; readonly reason: string };

export interface NextSlotFigures {
    readonly batchLossProbability: null | number;
    readonly creditSensitive: boolean;
    readonly cycleNet: Estimate;
    readonly documented: NextSlotMonthlyFigure;
    readonly documentedFundedBust: Estimate;
    readonly firmMinimumAboveRequest: FirmMinimumAboveRequestNotice | null;
    readonly isBelowHardRule2: boolean;
    readonly lifetimeCapBasis: LifetimePayoutCapBasis;
    readonly lifetimePayoutCapOverride: null | number;
    readonly netPerScreenHour: null | number;
    readonly noPayoutProbability: null | number;
    readonly optimum: NextSlotOptimumFigure | null;
    readonly rebuyLagBasis: EnginePolicy['rebuyLagBasis'];
    readonly rebuyLagDays: number;
    readonly sizingBasis: NextSlotSizingBasis;
    readonly trials: number;
}

export interface NextSlotInputs {
    readonly availableCents: null | number;
    readonly bankroll: BankrollParameters;
    readonly candidates: readonly NextSlotCandidate[];
    readonly ledger: PortfolioLedger;
    readonly objective: SizingObjective;
    readonly requestedPayoutDollars: number;
    readonly scaleGate: null | ScaleGate;
    readonly sortKey?: NextSlotSortKey;
    readonly today: string;
}

export type NextSlotLimit =
    | NextSlotExclusionReason.Capacity
    | NextSlotExclusionReason.NonPositiveExpectedValue
    | NextSlotExclusionReason.ScaleGateNotMet;

export interface NextSlotMonthlyFigure {
    readonly creditFree: Estimate;
    readonly creditInclusive: Estimate;
    readonly requestedCushion: number;
    readonly requestSize: number;
    readonly retainedCushion: number;
}

export interface NextSlotNotRankedRow {
    readonly figures: NextSlotFigures | null;
    readonly firmId: TradingFirm['id'];
    readonly firmName: string;
    readonly kind: NextSlotListingKind;
    readonly planLabel: string;
    readonly planSerial: string;
    readonly reasons: readonly NextSlotReason[];
}

export interface NextSlotOptimumFigure extends NextSlotMonthlyFigure {
    readonly evaluatedSizes: number;
    readonly fundedBustProbability: Estimate;
}

export interface NextSlotOptimumFigures {
    readonly creditSensitive: boolean;
    readonly evaluatedSizes: number;
    readonly expectedMonthlyNet: Estimate;
    readonly expectedMonthlyRealizedNet: Estimate;
    readonly fundedBustProbability: Estimate;
    readonly requestSize: number;
}

export interface NextSlotOptimumNeedInputs {
    readonly candidates: readonly NextSlotPlanPolicy[];
    readonly ledger: PortfolioLedger;
    readonly today: string;
}

export interface NextSlotPlanPolicy extends NextSlotPlanRef {
    readonly enginePolicy: EnginePolicy;
}

export interface NextSlotPlanRef {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

export interface NextSlotRankedRow {
    readonly allocatableSlots: number;
    readonly documentedRank: number;
    readonly figures: NextSlotFigures;
    readonly firmId: TradingFirm['id'];
    readonly firmName: string;
    readonly freeSlots: number;
    readonly inFlightEvaluations: number;
    readonly isNonPositiveExpectedValue: boolean;
    readonly limitedBy: NextSlotLimit | null;
    readonly optimumRank: null | number;
    readonly payoutPolicySensitive: boolean;
    readonly planLabel: string;
    readonly planSerial: string;
    readonly rank: number;
    readonly scaleMark: NextSlotScaleMarkDetail | null;
}

export interface NextSlotReason {
    readonly detail: string;
    readonly reason: NextSlotExclusionReason;
}

export interface NextSlotScaleMarkDetail {
    readonly mark: NextSlotScaleMark;
    readonly unmetConditions: readonly ScaleGateUnmetCondition[];
}

interface Context {
    readonly blocked: ReadonlyMap<string, PurchaseBlockReason>;
    readonly capRows: ReadonlyMap<string, PooledCapPlanRow>;
    readonly heldMaxSizeByFirm: ReadonlyMap<string, number>;
    readonly inFlightBySerial: ReadonlyMap<string, number>;
    readonly ledger: PortfolioLedger;
    readonly today: string;
    readonly usedBySerial: ReadonlyMap<string, number>;
}

interface RankableEntry {
    readonly candidate: NextSlotCandidate;
    readonly figures: NextSlotFigures;
    readonly freeSlots: number;
    readonly planSerial: string;
}

const EXCLUDING_REASONS: ReadonlySet<NextSlotExclusionReason> = new Set([
    NextSlotExclusionReason.Capacity,
    NextSlotExclusionReason.Cooldown,
    NextSlotExclusionReason.FirmPaused,
    NextSlotExclusionReason.FirmRetired,
    NextSlotExclusionReason.LiveExclusivity,
    NextSlotExclusionReason.NoFreeSlot,
    NextSlotExclusionReason.Unaffordable,
]);

const UNVERIFIED_REASONS: ReadonlySet<NextSlotExclusionReason> = new Set([
    NextSlotExclusionReason.CapScopeUnverified,
    NextSlotExclusionReason.LiveTriggerDiscretionary,
    NextSlotExclusionReason.LiveTriggerUnverified,
]);

const PENDING_REASONS: ReadonlySet<NextSlotExclusionReason> = new Set([
    NextSlotExclusionReason.EnginePending,
]);

const MAX_LOSING_PAYOUT_COUNT = 2000;

const UNSIZED_DISCLOSURE =
    'The documented runs use no instrument or stop, so they are unsized (no whole-contract rounding and no contract cap) and optimistic.';

const NO_BANKROLL_DISCLOSURE =
    'No bankroll deposits are recorded, so affordability and the batch loss risk are not applied.';

const OPTIMUM_MISSING_DISCLOSURE =
    'The payout-size optimum is missing for some plans, so the comparison of the two orders is withheld.';

const BATCH_LOSS_DISCLOSURE =
    'The batch loss risk draws the number of payouts per funded account from the simulated spread but takes every payout at the average payout size, so it ignores the spread of payout sizes and is optimistic.';

const OPTIMUM_BUST_DISCLOSURE =
    'The payout-size optimum maximises the expected monthly net and can carry a high chance of losing the funded account; read its funded bust figure, a share of all simulated attempts including those that never pass the evaluation, before using its request size.';

const SLOTS_UPPER_BOUND_DISCLOSURE =
    "Slots to fill is an upper bound: it fills slots from the top of the ranking and counts only funded accounts, so evaluations in progress that pass will take funded slots too. Spreading purchases across firms limits your exposure to one firm's rule changes, bans and payout delays.";

enum PlacementKind {
    Listed = 'listed',
    Rankable = 'rankable',
}

type Placement =
    | { readonly entry: RankableEntry; readonly kind: PlacementKind.Rankable }
    | {
          readonly kind: PlacementKind.Listed;
          readonly row: NextSlotNotRankedRow;
      };

export function isNextSlotHourKeyAvailable(
    bankroll: Pick<
        BankrollParameters,
        'accountsPerSession' | 'sessionHoursPerDay'
    >,
): boolean {
    return (
        bankroll.accountsPerSession !== null &&
        bankroll.sessionHoursPerDay !== null
    );
}

export function nextSlotAllocation(inputs: NextSlotInputs): NextSlotAllocation {
    const context = contextOf(inputs.ledger, inputs.today);
    const rankable: RankableEntry[] = [];
    const notRanked: NextSlotNotRankedRow[] = [];
    for (const candidate of inputs.candidates) {
        const placement = placementOf(candidate, context, inputs);
        if (placement.kind === PlacementKind.Listed) {
            notRanked.push(placement.row);
        } else {
            rankable.push(placement.entry);
        }
    }
    const sortKey =
        inputs.sortKey === NextSlotSortKey.Hour &&
        isNextSlotHourKeyAvailable(inputs.bankroll)
            ? NextSlotSortKey.Hour
            : NextSlotSortKey.Objective;
    const ordered = rankable.toSorted((a, b) =>
        sortKey === NextSlotSortKey.Hour
            ? compareByHour(a, b) || compareByObjective(a, b, inputs.objective)
            : compareByObjective(a, b, inputs.objective),
    );
    const isOptimumComparable = ordered.every(
        (entry) => entry.candidate.optimum.kind === NextSlotEngineKind.Ready,
    );
    const sensitivity = new Map(
        payoutPolicySensitivity(
            ordered.map((entry) =>
                sensitivityEntryOf(entry, isOptimumComparable),
            ),
        ).map((entry) => [entry.planKey, entry]),
    );
    const capacity = capacityOf(inputs.ledger, inputs.bankroll);
    let remaining = capacity?.remaining ?? Infinity;
    const ranked = ordered.map((entry, index) => {
        const scaleMark = scaleMarkOf(
            entry.candidate,
            context,
            inputs.scaleGate,
        );
        const blockedBy = noSlotReasonOf(entry, scaleMark);
        const allocatable =
            blockedBy === null ? Math.min(entry.freeSlots, remaining) : 0;
        remaining -= allocatable;
        const isLimitedByCapacity =
            capacity !== null && allocatable < entry.freeSlots;
        return rankedRowOf(
            entry,
            index + 1,
            sensitivity.get(entry.planSerial),
            allocatable,
            blockedBy ??
                (isLimitedByCapacity ? NextSlotExclusionReason.Capacity : null),
            scaleMark,
            context.inFlightBySerial.get(entry.planSerial) ?? 0,
        );
    });
    return {
        capacity,
        disclosures: disclosuresOf(
            inputs,
            ranked,
            notRanked,
            isOptimumComparable,
        ),
        hardRule2MinCushion: HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
        ledgerOnlyAccounts: activeLedgerOnlyCountOf(inputs.ledger),
        notRanked: notRanked.toSorted(compareNotRanked),
        objective: inputs.objective,
        optimumComparable: isOptimumComparable,
        ranked,
        sortKey,
    };
}

export function nextSlotCandidatePlans(
    firms: readonly TradingFirm[] = ALL_FIRMS,
): readonly NextSlotPlanRef[] {
    return firms.flatMap((firm) =>
        rankablePlans(firm.plans, false).map((plan) => ({ firm, plan })),
    );
}

export function nextSlotPlansNeedingOptimum(
    inputs: NextSlotOptimumNeedInputs,
): ReadonlySet<string> {
    const context = contextOf(inputs.ledger, inputs.today);
    return new Set(
        inputs.candidates
            .filter(
                (candidate) =>
                    preEngineReasonsOf(candidate, context).length === 0,
            )
            .map((candidate) => serialOf(candidate)),
    );
}

function activeLedgerOnlyCountOf(ledger: PortfolioLedger): number {
    return ledger.ledgerOnlyAccounts.filter((entry) =>
        isActiveAccountRow(entry.row),
    ).length;
}

function attemptPaysProbabilityOf(figures: NextSlotDocumentedFigures): number {
    return (
        figures.attemptPassProbability.value *
        figures.anyPayoutGivenFundedProbability.value
    );
}

function averagePayoutCentsOf(figures: NextSlotDocumentedFigures): number {
    const payouts = figures.payoutsPerFundedAccount.value;
    return payouts > 0
        ? (figures.expectedPayoutPerFundedAccount.value / payouts) *
              CENTS_PER_DOLLAR
        : 0;
}

function batchLossProbabilityOf(
    figures: NextSlotDocumentedFigures,
    availableCents: null | number,
): null | number {
    if (availableCents === null) return null;
    const cost = figures.costPerAttempt.value;
    const attempts = bankrollAttemptsAt(
        dollars(availableCents / CENTS_PER_DOLLAR),
        dollars(cost),
    );
    if (attempts === null) return null;
    const perAttempt = payoutCountsPerAttemptOf(figures);
    const averageCents = averagePayoutCentsOf(figures);
    if (perAttempt === null || !Number.isFinite(averageCents)) return null;
    const costCents = Math.round(attempts * cost * CENTS_PER_DOLLAR);
    if (costCents > 0 && averageCents <= 0) return 1;
    let losingCounts = 0;
    while (Math.round(losingCounts * averageCents) < costCents) {
        losingCounts += 1;
        if (losingCounts > MAX_LOSING_PAYOUT_COUNT) return null;
    }
    if (losingCounts === 0) return 0;
    const batch = truncatedPower(perAttempt, attempts, losingCounts);
    return Math.min(
        1,
        batch.reduce((sum, probability) => sum + probability, 0),
    );
}

function capacityOf(
    ledger: PortfolioLedger,
    bankroll: BankrollParameters,
): NextSlotCapacity | null {
    const limit = bankroll.dailyAccountCapacity;
    if (limit === null) return null;
    const activeUnits = dailyCapacityUnitsOf(
        ledger.accounts.map((entry) => entry.row),
    );
    return {
        activeUnits,
        limit,
        remaining: Math.max(0, limit - activeUnits),
    };
}

function compareByHour(a: RankableEntry, b: RankableEntry): number {
    const aHour = a.figures.netPerScreenHour;
    const bHour = b.figures.netPerScreenHour;
    if (aHour === null || bHour === null) {
        return aHour === bHour ? 0 : aHour === null ? 1 : -1;
    }
    return bHour - aHour;
}

function compareByObjective(
    a: RankableEntry,
    b: RankableEntry,
    objective: SizingObjective,
): number {
    const monthly =
        b.figures.documented.creditInclusive.value -
        a.figures.documented.creditInclusive.value;
    const tieBreak = a.planSerial.localeCompare(b.planSerial);
    switch (objective) {
        case SizingObjective.CycleCash: {
            return (
                b.figures.cycleNet.value - a.figures.cycleNet.value ||
                monthly ||
                tieBreak
            );
        }
        case SizingObjective.MonthlyNet: {
            return monthly || tieBreak;
        }
        case SizingObjective.RuinFirst: {
            const isANonPositive = isNonPositive(a);
            const isBNonPositive = isNonPositive(b);
            if (isANonPositive !== isBNonPositive)
                return isANonPositive ? 1 : -1;
            return (
                (isANonPositive ? 0 : compareLoss(a, b)) || monthly || tieBreak
            );
        }
    }
}

function compareLoss(a: RankableEntry, b: RankableEntry): number {
    const aLoss = a.figures.batchLossProbability;
    const bLoss = b.figures.batchLossProbability;
    if (aLoss === null || bLoss === null) {
        return aLoss === bLoss ? 0 : aLoss === null ? 1 : -1;
    }
    return aLoss - bLoss;
}

function compareNotRanked(
    a: NextSlotNotRankedRow,
    b: NextSlotNotRankedRow,
): number {
    return (
        a.firmName.localeCompare(b.firmName) ||
        a.planLabel.localeCompare(b.planLabel) ||
        a.planSerial.localeCompare(b.planSerial)
    );
}

function contextOf(ledger: PortfolioLedger, today: string): Context {
    const usage = pooledCapUsage(ledger);
    const blocked = purchaseBlockedFirms(exclusivityAccountsOf(ledger), today);
    const heldMaxSizeByFirm = new Map<string, number>();
    const inFlightBySerial = new Map<string, number>();
    for (const entry of modeledEntries(ledger)) {
        const { accountSize, firmId, planSerial, stage } = entry.row;
        heldMaxSizeByFirm.set(
            firmId,
            Math.max(heldMaxSizeByFirm.get(firmId) ?? 0, accountSize),
        );
        if (stage === AccountStage.Eval && isActiveAccountRow(entry.row)) {
            inFlightBySerial.set(
                planSerial,
                (inFlightBySerial.get(planSerial) ?? 0) + 1,
            );
        }
    }
    return {
        blocked: new Map(blocked.map((entry) => [entry.firmId, entry.reason])),
        capRows: new Map(usage.plans.map((row) => [row.planSerial, row])),
        heldMaxSizeByFirm,
        inFlightBySerial,
        ledger,
        today,
        usedBySerial: new Map(
            usage.plans.map((row) => [row.planSerial, row.used]),
        ),
    };
}

function disclosuresOf(
    inputs: NextSlotInputs,
    ranked: readonly NextSlotRankedRow[],
    notRanked: readonly NextSlotNotRankedRow[],
    isOptimumComparable: boolean,
): readonly string[] {
    const withFigures = [
        ...ranked.map((row) => row.figures),
        ...notRanked.flatMap((row) =>
            row.figures === null ? [] : [row.figures],
        ),
    ];
    const ledgerOnly = activeLedgerOnlyCountOf(inputs.ledger);
    return [
        ...(withFigures.some(
            (figures) => figures.sizingBasis === NextSlotSizingBasis.Unsized,
        )
            ? [UNSIZED_DISCLOSURE]
            : []),
        ...(!isOptimumComparable && ranked.length > 0
            ? [OPTIMUM_MISSING_DISCLOSURE]
            : []),
        ...(ranked.some((row) => row.figures.optimum !== null)
            ? [OPTIMUM_BUST_DISCLOSURE]
            : []),
        ...(inputs.availableCents === null ? [NO_BANKROLL_DISCLOSURE] : []),
        ...(ranked.some((row) => row.figures.batchLossProbability !== null)
            ? [BATCH_LOSS_DISCLOSURE]
            : []),
        ...(ranked.length > 0 ? [SLOTS_UPPER_BOUND_DISCLOSURE] : []),
        ...(ledgerOnly > 0
            ? [ledgerOnlyDisclosureOf(ledgerOnly, inputs.bankroll)]
            : []),
    ];
}

function engineReasonsOf(
    candidate: NextSlotCandidate,
): readonly NextSlotReason[] {
    const { documented } = candidate;
    switch (documented.kind) {
        case NextSlotEngineKind.Failed: {
            return [
                {
                    detail: `the engine run failed: ${documented.reason}`,
                    reason: NextSlotExclusionReason.EngineFailed,
                },
            ];
        }
        case NextSlotEngineKind.NotRequested:
        case NextSlotEngineKind.Pending: {
            return [
                {
                    detail: 'the engine run is still in progress',
                    reason: NextSlotExclusionReason.EnginePending,
                },
            ];
        }
        case NextSlotEngineKind.Ready: {
            return [];
        }
        case NextSlotEngineKind.Refused: {
            return [
                {
                    detail: `not rankable: ${documented.reason}`,
                    reason: NextSlotExclusionReason.NotRankable,
                },
            ];
        }
    }
}

function exclusivityAccountsOf(
    ledger: PortfolioLedger,
): readonly ExclusivityAccount[] {
    return modeledEntries(ledger).flatMap((entry) =>
        entry.plan === null
            ? []
            : {
                  accountPolicy: entry.plan.firm.accountPolicy,
                  events: entry.events.map((event) => ({
                      kind: event.kind,
                      occurredOn: event.occurredOn,
                  })),
                  firmId: entry.plan.firm.id,
                  id: entry.row.id,
                  plan: entry.plan.plan,
                  stage: entry.row.stage,
                  status: entry.row.status,
              },
    );
}

function figuresOf(
    candidate: NextSlotCandidate,
    documented: NextSlotDocumentedFigures,
    inputs: NextSlotInputs,
): NextSlotFigures {
    const { optimum } = candidate;
    const optimumFigures =
        optimum.kind === NextSlotEngineKind.Ready ? optimum.figures : null;
    const requested = inputs.requestedPayoutDollars;
    const { accountsPerSession, sessionHoursPerDay } = inputs.bankroll;
    const retainedCushion = candidate.plan.resolveRetainedCushion(
        documented.minRetainedCushion,
    );
    const cushions = {
        requestedCushion: documented.minRetainedCushion,
        retainedCushion,
    };
    return {
        batchLossProbability: batchLossProbabilityOf(
            documented,
            inputs.availableCents,
        ),
        creditSensitive: optimumFigures?.creditSensitive ?? false,
        cycleNet: documented.expectedNetPerAttempt,
        documented: {
            ...cushions,
            creditFree: documented.expectedMonthlyRealizedNet,
            creditInclusive: documented.expectedMonthlyNet,
            requestSize: documented.payoutRequestSize,
        },
        documentedFundedBust: documented.fundedBustProbability,
        firmMinimumAboveRequest: firmMinimumNotice(
            requested,
            effectivePayoutRequest(candidate.plan, requested),
        ),
        isBelowHardRule2:
            retainedCushion < HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
        lifetimeCapBasis: candidate.enginePolicy.lifetimePayoutCapBasis,
        lifetimePayoutCapOverride:
            candidate.enginePolicy.lifetimePayoutCapOverride,
        netPerScreenHour:
            accountsPerSession === null || sessionHoursPerDay === null
                ? null
                : (netPerScreenHour({
                      accountsPerSession,
                      expectedMonthlyNet: dollars(
                          documented.expectedMonthlyNet.value,
                      ),
                      sessionHoursPerDay,
                  }).value?.value ?? null),
        noPayoutProbability: bankrollNoPayoutAt(
            fraction(attemptPaysProbabilityOf(documented)),
            1,
        ),
        optimum:
            optimumFigures === null
                ? null
                : {
                      ...cushions,
                      creditFree: optimumFigures.expectedMonthlyRealizedNet,
                      creditInclusive: optimumFigures.expectedMonthlyNet,
                      evaluatedSizes: optimumFigures.evaluatedSizes,
                      fundedBustProbability:
                          optimumFigures.fundedBustProbability,
                      requestSize: optimumFigures.requestSize,
                  },
        rebuyLagBasis: candidate.enginePolicy.rebuyLagBasis,
        rebuyLagDays: candidate.enginePolicy.rebuyLagDays,
        sizingBasis:
            candidate.enginePolicy.instrument !== undefined &&
            candidate.enginePolicy.stopPoints !== undefined
                ? NextSlotSizingBasis.InstrumentStop
                : NextSlotSizingBasis.Unsized,
        trials: documented.trials,
    };
}

function freeSlotsOf(
    candidate: NextSlotCandidate | NextSlotPlanPolicy,
    context: Context,
): number {
    const row = context.capRows.get(serialOf(candidate));
    return row === undefined
        ? fundedSlotRoomOf(candidate.firm, candidate.plan, context.usedBySerial)
              .freeSlots
        : row.freeSlots;
}

function isNonPositive(entry: RankableEntry): boolean {
    return entry.figures.cycleNet.value <= 0;
}

function ledgerOnlyDisclosureOf(
    count: number,
    bankroll: BankrollParameters,
): string {
    const isSingular = count === 1;
    const subject = `${String(count)} ledger-only ${isSingular ? 'account' : 'accounts'}`;
    const verb = isSingular ? 'is' : 'are';
    return bankroll.dailyAccountCapacity === null
        ? `${subject} ${verb} not in the slots in use.`
        : `${subject} ${isSingular ? 'counts' : 'count'} in your capacity because ${isSingular ? 'it' : 'they'} still ${isSingular ? 'has' : 'have'} to be managed, but not in the slots in use.`;
}

function listedRow(
    candidate: NextSlotCandidate,
    reasons: readonly NextSlotReason[],
    figures: NextSlotFigures | null,
): Placement {
    return {
        kind: PlacementKind.Listed,
        row: {
            figures,
            firmId: candidate.firm.id,
            firmName: candidate.firm.displayName,
            kind: listingKindOf(reasons),
            planLabel: candidate.plan.label,
            planSerial: serialOf(candidate),
            reasons,
        },
    };
}

function listingKindOf(
    reasons: readonly NextSlotReason[],
): NextSlotListingKind {
    if (reasons.some((entry) => EXCLUDING_REASONS.has(entry.reason))) {
        return NextSlotListingKind.Excluded;
    }
    if (reasons.some((entry) => UNVERIFIED_REASONS.has(entry.reason))) {
        return NextSlotListingKind.Unverified;
    }
    return reasons.every((entry) => PENDING_REASONS.has(entry.reason))
        ? NextSlotListingKind.Pending
        : NextSlotListingKind.Refused;
}

function noSlotReasonOf(
    entry: RankableEntry,
    scaleMark: NextSlotScaleMarkDetail | null,
): NextSlotLimit | null {
    if (
        isNonPositive(entry) ||
        entry.figures.documented.creditInclusive.value <= 0
    ) {
        return NextSlotExclusionReason.NonPositiveExpectedValue;
    }
    return scaleMark === null ? null : NextSlotExclusionReason.ScaleGateNotMet;
}

function payoutCountsPerAttemptOf(
    figures: NextSlotDocumentedFigures,
): null | readonly number[] {
    const passes = figures.attemptPassProbability.value;
    const funded =
        figures.fundedPayoutCountDistribution.length === 0
            ? [1]
            : figures.fundedPayoutCountDistribution;
    return !(passes >= 0 && passes <= 1) ||
        funded.some((share) => !(share >= 0 && Number.isFinite(share)))
        ? null
        : funded.map((share, count) =>
              count === 0 ? 1 - passes + passes * share : passes * share,
          );
}

function placementOf(
    candidate: NextSlotCandidate,
    context: Context,
    inputs: NextSlotInputs,
): Placement {
    const { documented } = candidate;
    const figures =
        documented.kind === NextSlotEngineKind.Ready
            ? figuresOf(candidate, documented.figures, inputs)
            : null;
    const preEngine = preEngineReasonsOf(candidate, context);
    if (preEngine.some((entry) => EXCLUDING_REASONS.has(entry.reason))) {
        return listedRow(candidate, preEngine, figures);
    }
    const reasons: NextSlotReason[] = [
        ...preEngine,
        ...engineReasonsOf(candidate),
    ];
    if (reasons.length > 0 || documented.kind !== NextSlotEngineKind.Ready) {
        return listedRow(candidate, reasons, figures);
    }
    const { availableCents } = inputs;
    const attemptCost = documented.figures.costPerAttempt.value;
    if (
        availableCents !== null &&
        Math.round(attemptCost * CENTS_PER_DOLLAR) > availableCents
    ) {
        return listedRow(
            candidate,
            [
                {
                    detail: `the attempt cost ${formatCurrency(attemptCost)} is above your available bankroll ${formatCurrency(availableCents / CENTS_PER_DOLLAR)}`,
                    reason: NextSlotExclusionReason.Unaffordable,
                },
            ],
            figures,
        );
    }
    if (figures === null) {
        throw new Error(
            'nextSlotAllocation: a ready documented run produced no figures',
        );
    }
    return {
        entry: {
            candidate,
            figures,
            freeSlots: freeSlotsOf(candidate, context),
            planSerial: serialOf(candidate),
        },
        kind: PlacementKind.Rankable,
    };
}

function preEngineReasonsOf(
    candidate: NextSlotPlanPolicy,
    context: Context,
): readonly NextSlotReason[] {
    const firmName = candidate.firm.displayName;
    const engagement = firmEngagementFor(
        firmKeyOf({ externalFirmId: null, firmId: candidate.firm.id }),
        context.ledger.firmEngagements,
    );
    if (
        engagement !== null &&
        engagement.status !== FirmEngagementStatus.Active
    ) {
        const isRetired = engagement.status === FirmEngagementStatus.Retired;
        return [
            {
                detail: `you marked ${firmName} ${isRetired ? 'Retired' : 'Paused'} on ${engagement.sinceOn}`,
                reason: isRetired
                    ? NextSlotExclusionReason.FirmRetired
                    : NextSlotExclusionReason.FirmPaused,
            },
        ];
    }
    const blockedReason = context.blocked.get(candidate.firm.id);
    if (blockedReason !== undefined) {
        return [
            blockedReason === PurchaseBlockReason.Cooldown
                ? {
                      detail: `${firmName} is in its verified cooldown after a live bust, so new purchases are blocked`,
                      reason: NextSlotExclusionReason.Cooldown,
                  }
                : {
                      detail: `a live account at ${firmName} is active and the firm's verified rule blocks new evaluation purchases`,
                      reason: NextSlotExclusionReason.LiveExclusivity,
                  },
        ];
    }
    const isCapVerified = isFirmPolicyVerified(candidate.firm.accountPolicy);
    if (isCapVerified && freeSlotsOf(candidate, context) === 0) {
        const used = context.usedBySerial.get(serialOf(candidate)) ?? 0;
        const cap = candidate.firm.maxFundedAccounts(candidate.plan);
        return [
            {
                detail: `no free funded slot: ${String(used)} of ${String(cap)} in use`,
                reason: NextSlotExclusionReason.NoFreeSlot,
            },
        ];
    }
    return [
        ...(isCapVerified
            ? []
            : [
                  {
                      detail: `${firmName}'s account cap scope is not verified, so its free slots cannot be trusted`,
                      reason: NextSlotExclusionReason.CapScopeUnverified,
                  },
              ]),
        ...triggerReasonsOf(candidate),
    ];
}

function rankedRowOf(
    entry: RankableEntry,
    rank: number,
    sensitivity: PayoutPolicySensitivityRankedEntry | undefined,
    allocatableSlots: number,
    limitedBy: NextSlotLimit | null,
    scaleMark: NextSlotScaleMarkDetail | null,
    inFlightEvaluations: number,
): NextSlotRankedRow {
    const { candidate } = entry;
    if (sensitivity === undefined) {
        throw new Error(
            `nextSlotAllocation: no payout-policy rank computed for plan ${entry.planSerial}`,
        );
    }
    return {
        allocatableSlots,
        documentedRank: sensitivity.documentedRank,
        figures: entry.figures,
        firmId: candidate.firm.id,
        firmName: candidate.firm.displayName,
        freeSlots: entry.freeSlots,
        inFlightEvaluations,
        isNonPositiveExpectedValue: isNonPositive(entry),
        limitedBy,
        optimumRank: sensitivity.optimumRank,
        payoutPolicySensitive: sensitivity.payoutPolicySensitive,
        planLabel: candidate.plan.label,
        planSerial: entry.planSerial,
        rank,
        scaleMark,
    };
}

function scaleMarkOf(
    candidate: NextSlotCandidate,
    context: Context,
    gate: null | ScaleGate,
): NextSlotScaleMarkDetail | null {
    const heldMax = context.heldMaxSizeByFirm.get(candidate.firm.id);
    if (
        heldMax === undefined ||
        gate === null ||
        gate.status === ScaleGateStatus.Ready ||
        candidate.plan.id.accountSize <= heldMax
    ) {
        return null;
    }
    return {
        mark:
            gate.status === ScaleGateStatus.ThresholdsNotSet
                ? NextSlotScaleMark.ThresholdsNotSet
                : NextSlotScaleMark.ScaleGateNotMet,
        unmetConditions: gate.unmetConditions,
    };
}

function sensitivityEntryOf(
    entry: RankableEntry,
    isOptimumComparable: boolean,
): PayoutPolicySensitivityPlanEntry {
    const { candidate, figures } = entry;
    const { optimum } = candidate;
    return {
        documented: {
            monthlyNet: figures.documented.creditInclusive.value,
            standardError: figures.documented.creditInclusive.standardError,
        },
        labels: {
            lifetimeCapBasis: candidate.enginePolicy.lifetimePayoutCapBasis,
            payoutPolicy: PayoutRequestPolicy.FullRequestOnly,
            retainedCushion: figures.documented.retainedCushion,
            startBasis: StartBasis.Fresh,
            trials: figures.trials,
        },
        optimum:
            isOptimumComparable && optimum.kind === NextSlotEngineKind.Ready
                ? {
                      monthlyNet: optimum.figures.expectedMonthlyNet.value,
                      standardError:
                          optimum.figures.expectedMonthlyNet.standardError,
                  }
                : null,
        planKey: entry.planSerial,
    };
}

function serialOf(candidate: NextSlotPlanRef): string {
    return serializePlanId(candidate.plan.id);
}

function triggerReasonsOf(
    candidate: NextSlotPlanPolicy,
): readonly NextSlotReason[] {
    const firmName = candidate.firm.displayName;
    const triggers = candidate.firm.accountPolicy.liveTriggersFor(
        candidate.plan,
    );
    const isUnverified =
        candidate.enginePolicy.lifetimePayoutCapBasis ===
            LifetimePayoutCapBasis.LiveTriggersNotChecked ||
        triggers.length === 0 ||
        triggers.some(
            (trigger) =>
                trigger.kind === LiveTriggerKind.NotChecked ||
                trigger.source?.verification !== PolicyVerification.Confirmed,
        );
    if (isUnverified) {
        return [
            {
                detail: `live trigger unverified: ${firmName}'s live transition triggers are not confirmed, so payouts may stop sooner than modeled and the figures are optimistic`,
                reason: NextSlotExclusionReason.LiveTriggerUnverified,
            },
        ];
    }
    return triggers.some(
        (trigger) => trigger.kind === LiveTriggerKind.Discretionary,
    )
        ? [
              {
                  detail: `${firmName} may move an account live at its discretion, so payouts can stop at any time and the figures are optimistic`,
                  reason: NextSlotExclusionReason.LiveTriggerDiscretionary,
              },
          ]
        : [];
}

function truncatedPower(
    base: readonly number[],
    exponent: number,
    length: number,
): readonly number[] {
    let result: readonly number[] = [1];
    let square: readonly number[] = base.slice(0, length);
    let remaining = exponent;
    while (remaining > 0) {
        if (remaining % 2 === 1)
            result = truncatedProduct(result, square, length);
        remaining = Math.floor(remaining / 2);
        if (remaining > 0) square = truncatedProduct(square, square, length);
    }
    return result;
}

function truncatedProduct(
    a: readonly number[],
    b: readonly number[],
    length: number,
): readonly number[] {
    const product = Array.from(
        { length: Math.min(length, a.length + b.length - 1) },
        () => 0,
    );
    for (const [i, left] of a.entries()) {
        const reach = Math.min(b.length, length - i);
        for (let j = 0; j < reach; j++) {
            product[i + j] = (product[i + j] ?? 0) + left * (b[j] ?? 0);
        }
    }
    return product;
}
