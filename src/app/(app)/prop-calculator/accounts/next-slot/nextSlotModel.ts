import {
    type DocumentedRunFigures,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestGroupOf,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    type OverviewResult,
    type PayoutSizeOptimumFigures,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { groupFailureOf } from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import { type OverviewEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    isNextSlotHourKeyAvailable,
    type NextSlotAllocation,
    nextSlotAllocation,
    type NextSlotCandidate,
    nextSlotCandidatePlans,
    NextSlotEngineKind,
    type NextSlotEngineSlot,
    NextSlotExclusionReason,
    type NextSlotFigures,
    NextSlotListingKind,
    type NextSlotMonthlyFigure,
    type NextSlotNotRankedRow,
    type NextSlotOptimumFigure,
    nextSlotPlansNeedingOptimum,
    type NextSlotRankedRow,
    NextSlotScaleMark,
    NextSlotSizingBasis,
    NextSlotSortKey,
    type PortfolioLedger,
    replacementStats,
} from '~/lib/prop-accounts';
import { bankrollOf, scaleGateFromLedger } from '~/lib/prop-accounts/bankroll';
import {
    CENTS_PER_DOLLAR,
    NO_PLAN_OPT_INS,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    labelledAssumptionLines,
    LifetimePayoutCapBasis,
    type MeasuredRebuyLag,
    RebuyLagBasis,
    type RulebookParameters,
    RuleSource,
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { chooseObjective } from '~/lib/prop-calculator/advisor/actions';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export interface NextSlotListedViewRow {
    readonly documentedNet: string;
    readonly firm: string;
    readonly key: string;
    readonly plan: string;
    readonly reasons: readonly string[];
}

export interface NextSlotModel {
    readonly allocation: NextSlotAllocation;
    readonly assumptions: readonly string[];
    readonly automaticObjective: SizingObjective;
    readonly capacityNote: null | string;
    readonly computed: number;
    readonly disclosures: readonly string[];
    readonly engineFailure: null | string;
    readonly excluded: readonly NextSlotListedViewRow[];
    readonly isHourKeyAvailable: boolean;
    readonly isProvisional: boolean;
    readonly objective: SizingObjective;
    readonly objectiveChoiceNote: null | string;
    readonly objectiveFallbackNote: null | string;
    readonly objectiveNotAppliedNote: null | string;
    readonly pending: readonly NextSlotListedViewRow[];
    readonly ranked: readonly NextSlotRankedViewRow[];
    readonly refused: readonly NextSlotListedViewRow[];
    readonly requested: number;
    readonly sortKey: NextSlotSortKey;
    readonly sortNote: string;
    readonly unverified: readonly NextSlotListedViewRow[];
}

export interface NextSlotModelInputs {
    readonly engine: OverviewEngine;
    readonly ledger: PortfolioLedger;
    readonly objective?: SizingObjective;
    readonly requests: readonly OverviewRequest[];
    readonly rulebook: RulebookParameters;
    readonly sortKey?: NextSlotSortKey;
    readonly today: string;
    readonly trades: number;
}

export interface NextSlotRankedViewRow {
    readonly allocatable: string;
    readonly batchLoss: string;
    readonly capacityNote: null | string;
    readonly creditFree: string;
    readonly cycleNet: string;
    readonly documentedNet: string;
    readonly documentedRank: string;
    readonly firm: string;
    readonly freeSlots: string;
    readonly key: string;
    readonly labels: readonly string[];
    readonly liveTransferNotes: readonly string[];
    readonly minimumNote: null | string;
    readonly nonPositiveNote: null | string;
    readonly noPayout: string;
    readonly notes: readonly string[];
    readonly optimumBust: string;
    readonly optimumCreditFree: string;
    readonly optimumNet: string;
    readonly optimumNote: null | string;
    readonly optimumRank: string;
    readonly optimumRequest: string;
    readonly perScreenHour: string;
    readonly plan: string;
    readonly policySensitiveNote: null | string;
    readonly rank: string;
    readonly request: string;
    readonly scaleNote: null | string;
    readonly sizing: string;
}

const REQUEST_KINDS: ReadonlySet<OverviewRequestKind> = new Set([
    OverviewRequestKind.DocumentedRun,
    OverviewRequestKind.PayoutSizeOptimum,
]);

const FRESH_START_LABEL = 'Fresh start';

const CAPACITY_LIMIT_NOTE = 'Limited by your daily account capacity.';

const NON_POSITIVE_CYCLE_NOTE = 'Expected value per attempt is not positive.';

const NON_POSITIVE_MONTHLY_NOTE =
    'The credit-inclusive monthly net is not positive even though the cycle net is above zero, so no slots are filled.';

const CREDIT_BASIS_NOTE: Readonly<Record<SizingObjective, string>> = {
    [SizingObjective.CycleCash]:
        'Ranked by the cycle net (expected net per attempt), then by the credit-inclusive monthly net; the credit-free monthly figure is shown beside it.',
    [SizingObjective.MonthlyNet]:
        'Ranked by the credit-inclusive monthly net, the figure the command line ranks by; the credit-free figure is shown beside it.',
    [SizingObjective.RuinFirst]:
        'Ranked by the batch loss risk, lowest first, with plans whose cycle net is not positive last, then by the credit-inclusive monthly net; the credit-free figure is shown beside it.',
};

const HOUR_BASIS_NOTE =
    'Ranked by net per screen hour, built from the credit-inclusive monthly net; the credit-free figure is shown beside it.';

const RUIN_FIRST_NEEDS_BANKROLL_NOTE =
    'Ruin first needs a recorded bankroll to measure the batch loss risk, and no bankroll deposits are recorded, so this ranking stays on monthly net.';

const HOUR_SORT_NOTE =
    'Ranked by net per screen hour (monthly net times accounts per session, over trading days times session hours per day). Every plan uses the same hours, so this order equals the monthly net order. The documented and optimum ranks stay on monthly net, and the objective only breaks ties.';

const OBJECTIVE_SORT_NOTE = 'Ranked by the objective above.';

const HOUR_KEY_NEEDS_HOURS_NOTE =
    'Set accounts per session and session hours per day in your rulebook to sort by dollars per screen hour.';

const SIZING_LABEL: Readonly<Record<NextSlotSizingBasis, string>> = {
    [NextSlotSizingBasis.InstrumentStop]:
        'Sized at the policy instrument and stop',
    [NextSlotSizingBasis.Unsized]: 'Unsized, optimistic',
};

export function nextSlotModelOf(inputs: NextSlotModelInputs): NextSlotModel {
    const { engine, ledger, requests, rulebook, sortKey, today, trades } =
        inputs;
    const bySerial = requestsBySerial(requests);
    const candidates = nextSlotCandidatePlans().map(
        ({ firm, plan }): NextSlotCandidate => {
            const serial = serializePlanId(plan.id);
            const documentedRequest = bySerial
                .get(serial)
                ?.get(OverviewRequestKind.DocumentedRun);
            return {
                documented: slotOf(
                    engine,
                    documentedRequest,
                    documentedFiguresOf,
                    {
                        kind: NextSlotEngineKind.Failed,
                        reason: 'no engine request was built for this plan',
                    },
                ),
                enginePolicy: enginePolicyOf(documentedRequest, serial),
                firm,
                optimum: slotOf(
                    engine,
                    bySerial
                        .get(serial)
                        ?.get(OverviewRequestKind.PayoutSizeOptimum),
                    optimumFiguresOf,
                    { kind: NextSlotEngineKind.NotRequested },
                ),
                plan,
            };
        },
    );
    const availableCents =
        ledger.transfers.length > 0
            ? bankrollOf(ledger, today).availableCents
            : null;
    const automaticObjective = chooseObjective(
        availableCents,
        rulebook.bankroll,
    );
    const isRuinFirstWithoutBankroll =
        inputs.objective === SizingObjective.RuinFirst &&
        availableCents === null;
    const isChosen =
        inputs.objective !== undefined && !isRuinFirstWithoutBankroll;
    const objective = isRuinFirstWithoutBankroll
        ? SizingObjective.MonthlyNet
        : (inputs.objective ?? automaticObjective);
    const allocation = nextSlotAllocation({
        availableCents,
        bankroll: rulebook.bankroll,
        candidates,
        ledger,
        objective,
        requestedPayoutDollars: rulebook.payout.requestCents / CENTS_PER_DOLLAR,
        scaleGate: scaleGateFromLedger(ledger, today, rulebook.samples, trades),
        sortKey,
        today,
    });
    const isHourKeyAvailable = isNextSlotHourKeyAvailable(rulebook.bankroll);
    const computed = requests.filter((request) =>
        engine.outcomes.has(overviewRequestKey(request)),
    ).length;
    return {
        allocation,
        assumptions: assumptionsOf(
            rulebook,
            requests,
            allocation.hardRule2MinCushion,
        ),
        automaticObjective,
        capacityNote: capacityNoteOf(allocation),
        computed,
        disclosures: [
            rankingBasisNoteOf(objective, allocation.sortKey),
            ...allocation.disclosures,
        ],
        engineFailure: engineFailureOf(engine, requests),
        excluded: listedOf(allocation, NextSlotListingKind.Excluded),
        isHourKeyAvailable,
        isProvisional: computed < requests.length,
        objective,
        objectiveChoiceNote: objectiveChoiceNoteOf(
            objective,
            automaticObjective,
            isChosen,
        ),
        objectiveFallbackNote: isRuinFirstWithoutBankroll
            ? RUIN_FIRST_NEEDS_BANKROLL_NOTE
            : null,
        objectiveNotAppliedNote: objectiveNotAppliedNoteOf(
            objective,
            allocation.sortKey,
        ),
        pending: listedOf(allocation, NextSlotListingKind.Pending),
        ranked: allocation.ranked.map((row) =>
            rankedViewRowOf(
                row,
                allocation,
                liveTransferNotesOf(engine, bySerial.get(row.planSerial)),
            ),
        ),
        refused: listedOf(allocation, NextSlotListingKind.Refused),
        requested: requests.length,
        sortKey: allocation.sortKey,
        sortNote: sortNoteOf(allocation.sortKey, isHourKeyAvailable),
        unverified: listedOf(allocation, NextSlotListingKind.Unverified),
    };
}

export function nextSlotRequestsOf(
    ledger: PortfolioLedger,
    rulebook: RulebookParameters,
    today: string,
): readonly OverviewRequest[] {
    const refs = nextSlotCandidatePlans();
    const measuredRebuyLag = sharedRebuyLagOf(ledger);
    const requests = overviewRequestsFor(
        refs.map(({ firm, plan }) => ({
            firmId: firm.id,
            measuredRebuyLag,
            optIns: NO_PLAN_OPT_INS,
            planSerial: serializePlanId(plan.id),
        })),
        rulebook,
    );
    const bySerial = requestsBySerial(requests);
    const needing = nextSlotPlansNeedingOptimum({
        candidates: refs.flatMap(({ firm, plan }) => {
            const enginePolicy = bySerial
                .get(serializePlanId(plan.id))
                ?.get(OverviewRequestKind.DocumentedRun)?.spec.enginePolicy;
            return enginePolicy === undefined
                ? []
                : [{ enginePolicy, firm, plan }];
        }),
        ledger,
        today,
    });
    return requests.filter(
        (request) =>
            request.kind !== OverviewRequestKind.PayoutSizeOptimum ||
            needing.has(request.planSerial),
    );
}

function assumptionsOf(
    rulebook: RulebookParameters,
    requests: readonly OverviewRequest[],
    hardRule2MinCushion: number,
): readonly string[] {
    const first = requests.find(
        (request) => request.kind === OverviewRequestKind.DocumentedRun,
    );
    const { funded, payout, strategy } = rulebook;
    const lines = [
        `Strategy from your rulebook: ${formatPercent(strategy.winrate)} win rate, ${String(strategy.rr)} to 1 reward to risk, up to ${String(strategy.tradesPerDayMax)} trades per day in evaluations.`,
        `Funded phase from your rulebook: ${formatCurrency(funded.riskCents / CENTS_PER_DOLLAR)} risked and ${formatCurrency(funded.takeProfitCents / CENTS_PER_DOLLAR)} take profit per trade, up to ${String(funded.tradesPerDayMax)} trades per day, stop rule ${funded.stopRule.kind}.`,
        `Evaluation sizing from your rulebook: ${rulebook.eval.mode}.`,
        `Payout rule (${RuleSource.PayoutSize}, ${RuleSource.HardRule2}): your rulebook requests ${formatCurrency(payout.requestCents / CENTS_PER_DOLLAR)} as a full request only, with a retained cushion of at least ${formatCurrency(payout.retainedCushionCents / CENTS_PER_DOLLAR)} and never below the plan's own floor; a plan whose firm minimum is above the request runs at that minimum. Hard Rule 2 asks for at least ${formatCurrency(hardRule2MinCushion)}.`,
    ];
    if (first === undefined) return lines;
    const { enginePolicy, run } = first.spec;
    return [
        ...lines,
        `Every run simulates ${run.trials.toLocaleString('en-US')} trials with seed ${String(run.seed)}, up to ${String(run.maxEvalDays)} evaluation days and a ${String(enginePolicy.fundedHorizonDays)} day funded horizon.`,
        enginePolicy.commissionPerRoundTrip === 0
            ? 'Commission is zero, which is optimistic.'
            : `Commission is ${formatCurrency(enginePolicy.commissionPerRoundTrip)} per round trip.`,
        rebuyLagNoteOf(enginePolicy),
    ];
}

function capacityNoteOf(allocation: NextSlotAllocation): null | string {
    const { capacity } = allocation;
    return capacity === null
        ? null
        : `Capacity: ${String(capacity.activeUnits)} of ${String(capacity.limit)} daily accounts in use (a copy group counts once), ${String(capacity.remaining)} left.`;
}

function currencyEstimate(estimate: UncertainValue): string {
    const standardError =
        estimate.standardError === null
            ? NOT_APPLICABLE
            : formatCurrency(estimate.standardError);
    return `${formatCurrency(estimate.value)} (SE ${standardError})`;
}

function cushionLabelOf(figure: NextSlotMonthlyFigure): string {
    const suffix =
        figure.requestedCushion === figure.retainedCushion
            ? 'engine-resolved'
            : `engine-resolved from ${formatCurrency(figure.requestedCushion)} requested`;
    return `Retained cushion ${formatCurrency(figure.retainedCushion)} (${suffix})`;
}

function documentedFiguresOf(
    result: OverviewResult,
): DocumentedRunFigures | null {
    return result.kind === OverviewRequestKind.DocumentedRun
        ? result.figures
        : null;
}

function engineFailureOf(
    engine: OverviewEngine,
    requests: readonly OverviewRequest[],
): null | string {
    const groups = new Set(
        requests.map((request) => overviewRequestGroupOf(request)),
    );
    for (const group of groups) {
        const failure = groupFailureOf(engine, group);
        if (failure !== null) return failure;
    }
    return null;
}

function enginePolicyOf(
    request: OverviewRequest | undefined,
    serial: string,
): NextSlotCandidate['enginePolicy'] {
    if (request === undefined) {
        throw new Error(
            `nextSlotModel: no documented-run request was built for plan ${serial}`,
        );
    }
    return request.spec.enginePolicy;
}

function lifetimeCapLabel(figures: NextSlotFigures): string {
    switch (figures.lifetimeCapBasis) {
        case LifetimePayoutCapBasis.LiveTriggersNotChecked: {
            return 'Live triggers not checked (optimistic)';
        }
        case LifetimePayoutCapBasis.VerifiedCountTrigger: {
            return `Lifetime payout cap ${String(figures.lifetimePayoutCapOverride ?? 0)} (verified count trigger)`;
        }
        case LifetimePayoutCapBasis.VerifiedNoCountTrigger: {
            return 'No live count trigger (verified)';
        }
    }
}

function listedOf(
    allocation: NextSlotAllocation,
    kind: NextSlotListingKind,
): readonly NextSlotListedViewRow[] {
    return allocation.notRanked
        .filter((row) => row.kind === kind)
        .map((row) => listedViewRowOf(row));
}

function listedViewRowOf(row: NextSlotNotRankedRow): NextSlotListedViewRow {
    return {
        documentedNet:
            row.figures === null
                ? NOT_APPLICABLE
                : currencyEstimate(row.figures.documented.creditInclusive),
        firm: row.firmName,
        key: row.planSerial,
        plan: row.planLabel,
        reasons: row.reasons.map((reason) => reason.detail),
    };
}

function liveTransferNotesOf(
    engine: OverviewEngine,
    kinds: ReadonlyMap<OverviewRequestKind, OverviewRequest> | undefined,
): readonly string[] {
    const documented = succeededFiguresOf(
        engine,
        kinds?.get(OverviewRequestKind.DocumentedRun),
        documentedFiguresOf,
    );
    const optimum = succeededFiguresOf(
        engine,
        kinds?.get(OverviewRequestKind.PayoutSizeOptimum),
        optimumFiguresOf,
    );
    return [
        ...labelledAssumptionLines(
            'Documented policy',
            documented?.liveTransfer,
        ),
        ...labelledAssumptionLines(
            'Documented policy',
            documented?.cumulativePayoutTrigger,
        ),
        ...labelledAssumptionLines(
            'Payout-size optimum',
            optimum?.liveTransfer,
        ),
        ...labelledAssumptionLines(
            'Payout-size optimum',
            optimum?.cumulativePayoutTrigger,
        ),
    ];
}

function monthlyFigureText(
    figure: NextSlotMonthlyFigure | NextSlotOptimumFigure | null,
): {
    readonly creditFree: string;
    readonly creditInclusive: string;
    readonly requestSize: string;
} {
    return figure === null
        ? {
              creditFree: NOT_APPLICABLE,
              creditInclusive: NOT_APPLICABLE,
              requestSize: NOT_APPLICABLE,
          }
        : {
              creditFree: currencyEstimate(figure.creditFree),
              creditInclusive: currencyEstimate(figure.creditInclusive),
              requestSize: formatCurrency(figure.requestSize),
          };
}

function nonPositiveNoteOf(row: NextSlotRankedRow): null | string {
    if (row.isNonPositiveExpectedValue) return NON_POSITIVE_CYCLE_NOTE;
    return row.limitedBy === NextSlotExclusionReason.NonPositiveExpectedValue
        ? NON_POSITIVE_MONTHLY_NOTE
        : null;
}

function objectiveChoiceNoteOf(
    objective: SizingObjective,
    automatic: SizingObjective,
    isChosen: boolean,
): null | string {
    if (isChosen) {
        return automatic === objective
            ? 'Chosen by you.'
            : `Chosen by you. Your bankroll would choose ${SIZING_OBJECTIVE_LABEL[automatic]} automatically.`;
    }
    return objective === SizingObjective.RuinFirst
        ? 'Chosen automatically: your available bankroll is below your objective threshold. Pick another objective here to override it.'
        : null;
}

function objectiveNotAppliedNoteOf(
    objective: SizingObjective,
    sortKey: NextSlotSortKey,
): null | string {
    switch (sortKey) {
        case NextSlotSortKey.Hour: {
            return objective === SizingObjective.MonthlyNet
                ? null
                : `The ${SIZING_OBJECTIVE_LABEL[objective]} objective above is not applied to the order while the table is sorted by net per screen hour, which follows the monthly net; it only breaks ties.`;
        }
        case NextSlotSortKey.Objective: {
            return null;
        }
    }
}

function optimumFiguresOf(
    result: OverviewResult,
): null | PayoutSizeOptimumFigures {
    return result.kind === OverviewRequestKind.PayoutSizeOptimum
        ? result.figures
        : null;
}

function optimumNoteOf(figures: NextSlotFigures): null | string {
    const { documented, optimum } = figures;
    if (optimum === null) return null;
    return optimum.requestSize === documented.requestSize
        ? `The optimum asks the same ${formatCurrency(optimum.requestSize)} request as the documented rule.`
        : `The optimum asks ${formatCurrency(optimum.requestSize)} instead of the documented ${formatCurrency(documented.requestSize)}: it ends in a funded bust in ${formatPercent(optimum.fundedBustProbability.value)} of all simulated attempts over ${String(optimum.evaluatedSizes)} sizes tried, against ${formatPercent(figures.documentedFundedBust.value)} of all simulated attempts at the documented request.`;
}

function rankedViewRowOf(
    row: NextSlotRankedRow,
    allocation: NextSlotAllocation,
    liveTransferNotes: readonly string[],
): NextSlotRankedViewRow {
    const { figures } = row;
    const documented = monthlyFigureText(figures.documented);
    const optimum = monthlyFigureText(figures.optimum);
    const optimumCount = allocation.ranked.filter(
        (candidate) => candidate.optimumRank !== null,
    ).length;
    return {
        allocatable: String(row.allocatableSlots),
        batchLoss:
            figures.batchLossProbability === null
                ? NOT_APPLICABLE
                : formatPercent(figures.batchLossProbability),
        capacityNote:
            row.limitedBy === NextSlotExclusionReason.Capacity
                ? CAPACITY_LIMIT_NOTE
                : null,
        creditFree: documented.creditFree,
        cycleNet: currencyEstimate(figures.cycleNet),
        documentedNet: documented.creditInclusive,
        documentedRank: `${String(row.documentedRank)} of ${String(allocation.ranked.length)}`,
        firm: row.firmName,
        freeSlots: String(row.freeSlots),
        key: row.planSerial,
        labels: [
            FRESH_START_LABEL,
            `${figures.trials.toLocaleString('en-US')} trials`,
            cushionLabelOf(figures.documented),
            `Full request only at ${formatCurrency(figures.documented.requestSize)}`,
            lifetimeCapLabel(figures),
            rebuyLagLabelOf(figures),
        ],
        liveTransferNotes,
        minimumNote:
            figures.firmMinimumAboveRequest === null
                ? null
                : `Firm minimum ${formatCurrency(figures.firmMinimumAboveRequest.minimumRequestAmount)} is above your ${formatCurrency(figures.firmMinimumAboveRequest.requestedAmount)} request, so this plan runs at its minimum.`,
        nonPositiveNote: nonPositiveNoteOf(row),
        noPayout:
            figures.noPayoutProbability === null
                ? NOT_APPLICABLE
                : formatPercent(figures.noPayoutProbability),
        notes: [
            ...(figures.isBelowHardRule2
                ? [
                      `Retained cushion is below the ${RuleSource.HardRule2} minimum of ${formatCurrency(allocation.hardRule2MinCushion)}.`,
                  ]
                : []),
            ...(row.inFlightEvaluations > 0
                ? [
                      `${String(row.inFlightEvaluations)} ${row.inFlightEvaluations === 1 ? 'evaluation' : 'evaluations'} in progress on this plan may convert to funded slots.`,
                  ]
                : []),
            ...(figures.creditSensitive
                ? [
                      'The payout-size optimum is credit sensitive: the credit-free figures would choose another request size.',
                  ]
                : []),
        ],
        optimumBust:
            figures.optimum === null
                ? NOT_APPLICABLE
                : formatPercent(figures.optimum.fundedBustProbability.value),
        optimumCreditFree: optimum.creditFree,
        optimumNet: optimum.creditInclusive,
        optimumNote: optimumNoteOf(figures),
        optimumRank:
            row.optimumRank === null
                ? NOT_APPLICABLE
                : `${String(row.optimumRank)} of ${String(optimumCount)}`,
        optimumRequest: optimum.requestSize,
        perScreenHour:
            figures.netPerScreenHour === null
                ? NOT_APPLICABLE
                : formatCurrency(figures.netPerScreenHour),
        plan: row.planLabel,
        policySensitiveNote: row.payoutPolicySensitive
            ? 'Payout-policy sensitive: the plan order changes under the payout-size optimum.'
            : null,
        rank: String(row.rank),
        request: documented.requestSize,
        scaleNote:
            row.scaleMark === null
                ? null
                : row.scaleMark.mark === NextSlotScaleMark.ThresholdsNotSet
                  ? 'A larger size than you hold at this firm: sample thresholds not set.'
                  : `A larger size than you hold at this firm: scale gate not met (${String(row.scaleMark.unmetConditions.length)} unmet).`,
        sizing: SIZING_LABEL[figures.sizingBasis],
    };
}

function rankingBasisNoteOf(
    objective: SizingObjective,
    sortKey: NextSlotSortKey,
): string {
    switch (sortKey) {
        case NextSlotSortKey.Hour: {
            return HOUR_BASIS_NOTE;
        }
        case NextSlotSortKey.Objective: {
            return CREDIT_BASIS_NOTE[objective];
        }
    }
}

function rebuyLagLabelOf(figures: NextSlotFigures): string {
    return figures.rebuyLagBasis === RebuyLagBasis.Measured
        ? `Rebuy lag ${String(figures.rebuyLagDays)} days (measured across your plans)`
        : 'Rebuy lag 0 days (assumed, optimistic)';
}

function rebuyLagNoteOf(
    enginePolicy: NextSlotCandidate['enginePolicy'],
): string {
    return enginePolicy.rebuyLagBasis === RebuyLagBasis.Measured
        ? `Every plan, held or not, runs with the same rebuy lag of ${String(enginePolicy.rebuyLagDays)} days, the sample-weighted average measured across your plans.`
        : 'Every plan runs with an assumed rebuy lag of 0 days, which is optimistic: you have no measured replacement yet.';
}

function requestsBySerial(
    requests: readonly OverviewRequest[],
): ReadonlyMap<string, ReadonlyMap<OverviewRequestKind, OverviewRequest>> {
    const bySerial = new Map<
        string,
        Map<OverviewRequestKind, OverviewRequest>
    >();
    for (const request of requests) {
        if (!REQUEST_KINDS.has(request.kind)) continue;
        const kinds =
            bySerial.get(request.planSerial) ??
            new Map<OverviewRequestKind, OverviewRequest>();
        kinds.set(request.kind, request);
        bySerial.set(request.planSerial, kinds);
    }
    return bySerial;
}

function sharedRebuyLagOf(ledger: PortfolioLedger): MeasuredRebuyLag | null {
    let samples = 0;
    let weightedDays = 0;
    for (const row of replacementStats(ledger).perPlan) {
        if (row.lagSessions == null || row.lagSamples === 0) continue;
        samples += row.lagSamples;
        weightedDays += row.lagSessions.value * row.lagSamples;
    }
    return samples === 0 ? null : { days: weightedDays / samples, samples };
}

function slotOf<Figures>(
    engine: OverviewEngine,
    request: OverviewRequest | undefined,
    figuresOf: (result: OverviewResult) => Figures | null,
    missing: NextSlotEngineSlot<Figures>,
): NextSlotEngineSlot<Figures> {
    if (request === undefined) return missing;
    const outcome = engine.outcomes.get(overviewRequestKey(request));
    if (outcome === undefined) {
        const failure = groupFailureOf(engine, overviewRequestGroupOf(request));
        return failure === null
            ? { kind: NextSlotEngineKind.Pending }
            : { kind: NextSlotEngineKind.Failed, reason: failure };
    }
    if (outcome.kind === OverviewOutcomeKind.Failed) {
        return { kind: NextSlotEngineKind.Refused, reason: outcome.reason };
    }
    const figures = figuresOf(outcome.result);
    return figures === null
        ? {
              kind: NextSlotEngineKind.Failed,
              reason: 'the engine answered with a result of the wrong kind',
          }
        : { figures, kind: NextSlotEngineKind.Ready };
}

function sortNoteOf(
    sortKey: NextSlotSortKey,
    isHourKeyAvailable: boolean,
): string {
    switch (sortKey) {
        case NextSlotSortKey.Hour: {
            return HOUR_SORT_NOTE;
        }
        case NextSlotSortKey.Objective: {
            return isHourKeyAvailable
                ? OBJECTIVE_SORT_NOTE
                : `${OBJECTIVE_SORT_NOTE} ${HOUR_KEY_NEEDS_HOURS_NOTE}`;
        }
    }
}

function succeededFiguresOf<Figures>(
    engine: OverviewEngine,
    request: OverviewRequest | undefined,
    figuresOf: (result: OverviewResult) => Figures | null,
): Figures | null {
    if (request === undefined) return null;
    const outcome = engine.outcomes.get(overviewRequestKey(request));
    return outcome?.kind === OverviewOutcomeKind.Succeeded
        ? figuresOf(outcome.result)
        : null;
}
