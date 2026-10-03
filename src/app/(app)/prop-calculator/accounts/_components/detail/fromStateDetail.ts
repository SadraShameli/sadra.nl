import { payoutPathStepText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    stepAssumptionsHeading,
    VALUE_CHAIN_STEP_LABEL,
} from '~/app/(app)/prop-calculator/_components/value/valueChainStepLabels';
import {
    overviewPlanOptInsOf,
    type OverviewRequest,
    OverviewRequestKind,
    overviewRetireRequestsFor,
    overviewValueChainRequestsFor,
    type ValueChainFigures,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    accountFromStateRequestOf,
    personalAccountRequestOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import {
    type EngineSlot,
    EngineSlotKind,
    engineSlotOf,
    type SlotEngine,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import { formatCurrency } from '~/lib/format';
import { type PersonalRules } from '~/lib/prop-accounts';
import {
    type Dollars,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type AccountPendingPayoutCounts,
    type AccountSnapshotInput,
    type DocumentedPolicySpec,
    labelledAssumptionLines,
    type MeasuredRebuyLag,
    payoutPath,
    type ReconstructedAccount,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedRetainedCushion,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    RetireComparisonBasis,
    RetireComparisonReason,
    type RetireComparisonResult,
    RetireComparisonVerdict,
    ValueChainStepKind,
    type ValueResult,
} from '~/lib/prop-calculator/advisor/value';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export const FROM_STATE_NOT_MODELED_TEXT =
    'The plan of this account is not modeled by the engine, so no figures from this state can be computed.';

export const FROM_STATE_PERSONAL_RULES_NOTE =
    'These figures simulate your personal payout request, retained cushion, max risk per trade, max trades per day, daily loss limit and daily profit cap.';

const RETIRE_NOTE =
    'Information only. This comparison never changes the next action on this account.';

const RETIRE_NOT_COMPARABLE_HAZARD_VERDICT_TEXT =
    'Not comparable at this hazard: the fresh-account rate prices no live-transfer hazard';

const RETIRE_NOT_COMPARABLE_TRIGGER_VERDICT_TEXT =
    'Not comparable at this trigger: the fresh-account rate prices no cumulative payout trigger';

const RETIRE_NOT_COMPARABLE_HAZARD_AND_TRIGGER_VERDICT_TEXT =
    'Not comparable at this hazard and trigger: the fresh-account rate prices no live-transfer hazard and no cumulative payout trigger';

const RETIRE_SLOT_RATE_HAZARD_FREE_TEXT =
    'The fresh-account rate is the average-reward DP slot rate, which prices no live-transfer hazard, while the keep rate prices yours.';

const RETIRE_SLOT_RATE_TRIGGER_FREE_TEXT =
    'The fresh-account rate is the average-reward DP slot rate, which prices no cumulative payout trigger, while the keep rate prices the firm confirmed one.';

const RETIRE_BASIS_TEXT: Readonly<Record<RetireComparisonBasis, string>> = {
    [RetireComparisonBasis.AverageRewardDp]:
        'a fresh account of the same plan at its average-reward slot rate',
    [RetireComparisonBasis.Simulator]:
        'a fresh account of the same plan, simulated under the same policy',
};

const RETIRE_REASON_TEXT: Readonly<Record<RetireComparisonReason, string>> = {
    [RetireComparisonReason.NoRemainingHorizon]:
        'No horizon is left to earn from this account.',
    [RetireComparisonReason.NotCapacityBound]:
        'A fresh account looks ahead, but account-slot scarcity is not tracked yet, so this comparison does not recommend switching.',
    [RetireComparisonReason.SwitchBehind]:
        'A fresh account of the same plan is behind keeping this one.',
    [RetireComparisonReason.Unknown]:
        'The difference cannot be judged because a standard error is missing.',
    [RetireComparisonReason.WithinNoise]:
        'The difference is within the simulation noise.',
};

const RETIRE_VERDICT_TEXT: Readonly<Record<RetireComparisonVerdict, string>> = {
    [RetireComparisonVerdict.Keep]: 'Keep this account',
    [RetireComparisonVerdict.SwitchBeatsKeep]:
        'A fresh account would beat keeping this one',
};

export enum ChainPositionViewKind {
    Pending = 'pending',
    Ready = 'ready',
    Unavailable = 'unavailable',
}

export enum FromStateDetailKind {
    Pending = 'pending',
    Ready = 'ready',
    Unavailable = 'unavailable',
}

export enum RetireViewKind {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
    Refused = 'refused',
}

export type ChainPositionView =
    | { readonly kind: ChainPositionViewKind.Pending }
    | {
          readonly kind: ChainPositionViewKind.Ready;
          readonly model: ValueChainPositionModel;
      }
    | {
          readonly kind: ChainPositionViewKind.Unavailable;
          readonly reason: string;
      };

export type FromStateDetail =
    | {
          readonly engine: SlotEngine;
          readonly kind: FromStateDetailKind.Ready;
          readonly requests: FromStateDetailRequests;
      }
    | { readonly kind: FromStateDetailKind.Pending }
    | {
          readonly kind: FromStateDetailKind.Unavailable;
          readonly reason: string;
      };

export interface FromStateDetailInput {
    readonly input: AccountSnapshotInput;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly pendingPayoutCounts: AccountPendingPayoutCounts;
    readonly personalMaxRiskPerTrade: Dollars | null;
    readonly personalRules: null | PersonalRules | undefined;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
}

export interface FromStateDetailRequests {
    readonly account: OverviewRequest;
    readonly chain: OverviewRequest;
    readonly retire: OverviewRequest;
}

export type RetireView =
    | { readonly kind: RetireViewKind.Failed; readonly reason: string }
    | { readonly kind: RetireViewKind.Pending }
    | { readonly kind: RetireViewKind.Ready; readonly model: RetireModel }
    | { readonly kind: RetireViewKind.Refused; readonly reason: string };

export interface ValueChainPositionModel {
    readonly above: readonly string[];
    readonly below: readonly string[];
    readonly eligibleAssumptions: null | {
        readonly heading: string;
        readonly lines: readonly string[];
    };
    readonly unavailable: readonly string[];
}

interface RetireModel {
    readonly basis: string;
    readonly isComparable: boolean;
    readonly keepRate: string;
    readonly liveTransferNotes: readonly string[];
    readonly note: string;
    readonly reason: null | string;
    readonly remainingDays: string;
    readonly switchCost: string;
    readonly switchRate: string;
    readonly verdict: string;
}

export function chainPositionViewOf(
    engine: SlotEngine,
    requests: FromStateDetailRequests,
): ChainPositionView {
    const chain = valueChainSlotOf(engine, requests.chain);
    const account = engineSlotOf(engine, requests.account, (result) =>
        result.kind === OverviewRequestKind.AccountFromState
            ? result.figures
            : null,
    );
    switch (chain.kind) {
        case EngineSlotKind.Failed:
        case EngineSlotKind.Refused: {
            return {
                kind: ChainPositionViewKind.Unavailable,
                reason: chain.reason,
            };
        }
        case EngineSlotKind.Pending: {
            return { kind: ChainPositionViewKind.Pending };
        }
        case EngineSlotKind.Ready: {
            if (account.kind !== EngineSlotKind.Ready) {
                return account.kind === EngineSlotKind.Pending
                    ? { kind: ChainPositionViewKind.Pending }
                    : {
                          kind: ChainPositionViewKind.Unavailable,
                          reason: account.reason,
                      };
            }
            return {
                kind: ChainPositionViewKind.Ready,
                model: valueChainPositionOf(
                    account.figures.valueNow,
                    chain.figures,
                ),
            };
        }
    }
}

export function fromStateDetailRequestsOf(
    input: FromStateDetailInput,
): FromStateDetailRequests | null {
    const { measuredRebuyLag, plan, rulebook } = input;
    const planInput = {
        account: input.input,
        firmId: plan.id.firm,
        measuredRebuyLag,
        optIns: overviewPlanOptInsOf(plan),
        pendingPayoutCounts: input.pendingPayoutCounts,
        planSerial: serializePlanId(plan.id),
    };
    const account = accountFromStateRequestOf({
        account: input.input,
        measuredRebuyLag,
        pendingPayoutCounts: input.pendingPayoutCounts,
        personalMaxRiskPerTrade: input.personalMaxRiskPerTrade,
        personalRules: input.personalRules,
        plan,
        rulebook,
    });
    const [retireRequest] = overviewRetireRequestsFor([planInput], rulebook);
    const [chainRequest] = overviewValueChainRequestsFor([planInput], rulebook);
    return account === undefined ||
        chainRequest === undefined ||
        retireRequest === undefined
        ? null
        : {
              account,
              chain: personalAccountRequestOf(
                  chainRequest,
                  input.personalRules,
                  input.personalMaxRiskPerTrade,
              ),
              retire: personalAccountRequestOf(
                  retireRequest,
                  input.personalRules,
                  input.personalMaxRiskPerTrade,
              ),
          };
}

export function payoutPathLinesOf(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
): null | readonly string[] {
    if (
        account.kind !== TradingPhase.Funded ||
        account.fundedTracker === null
    ) {
        return null;
    }
    const { enginePolicy, rulebook } = spec;
    return payoutPath(
        account.state,
        account.plan,
        account.fundedTracker,
        resolveDocumentedRetainedCushion(enginePolicy, rulebook.payout),
        resolveDocumentedPayoutRequestSize(
            account.plan,
            enginePolicy,
            rulebook.payout,
        ),
    ).map((step) => payoutPathStepText(step));
}

export function retireViewOf(
    engine: SlotEngine,
    request: OverviewRequest,
): RetireView {
    const slot = engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.RetireComparison
            ? result.figures
            : null,
    );
    switch (slot.kind) {
        case EngineSlotKind.Failed: {
            return { kind: RetireViewKind.Failed, reason: slot.reason };
        }
        case EngineSlotKind.Pending: {
            return { kind: RetireViewKind.Pending };
        }
        case EngineSlotKind.Ready: {
            return {
                kind: RetireViewKind.Ready,
                model: retireModelOf(slot.figures),
            };
        }
        case EngineSlotKind.Refused: {
            return { kind: RetireViewKind.Refused, reason: slot.reason };
        }
    }
}

export function valueChainPositionOf(
    valueNow: ValueResult,
    chain: ValueChainFigures,
): ValueChainPositionModel {
    const above: string[] = [];
    const below: string[] = [];
    const unavailable: string[] = [];
    let eligibleAssumptions: ValueChainPositionModel['eligibleAssumptions'] =
        null;
    for (const step of chain.steps) {
        const label = VALUE_CHAIN_STEP_LABEL[step.kind];
        const { outcome } = step;
        if (outcome.kind === ValueChainStepOutcomeKind.Unavailable) {
            unavailable.push(`${label}: ${outcome.reason}`);
            continue;
        }
        if (
            step.kind === ValueChainStepKind.FirstPayoutEligible &&
            step.assumptions.length > 0
        ) {
            eligibleAssumptions = {
                heading: stepAssumptionsHeading(step.kind),
                lines: step.assumptions,
            };
        }
        if (valueNow.creditFree.value > outcome.value.creditFree.value) {
            above.push(label);
        } else {
            below.push(label);
        }
    }
    return { above, below, eligibleAssumptions, unavailable };
}

function isNotComparable(figures: RetireComparisonResult): boolean {
    return (
        (figures.isSlotRateHazardFree === true ||
            figures.isSlotRateTriggerFree === true) &&
        figures.verdict === RetireComparisonVerdict.SwitchBeatsKeep
    );
}

function perDayText(rate: UncertainValue): string {
    const standardError =
        rate.standardError === null
            ? 'n/a'
            : formatCurrency(rate.standardError, 2);
    return `${formatCurrency(rate.value, 2)} per day (SE ${standardError})`;
}

function retireLiveTransferLinesOf(
    figures: RetireComparisonResult,
): readonly string[] {
    return [
        ...labelledAssumptionLines('Keeping this account', figures.liveTransfer),
        ...(figures.isSlotRateHazardFree === true
            ? [RETIRE_SLOT_RATE_HAZARD_FREE_TEXT]
            : []),
        ...labelledAssumptionLines(
            'A fresh account',
            figures.replacementLiveTransfer,
        ),
        ...labelledAssumptionLines(
            'Keeping this account',
            figures.cumulativePayoutTrigger,
        ),
        ...(figures.isSlotRateTriggerFree === true
            ? [RETIRE_SLOT_RATE_TRIGGER_FREE_TEXT]
            : []),
        ...labelledAssumptionLines(
            'A fresh account',
            figures.replacementCumulativePayoutTrigger,
        ),
    ];
}

function retireModelOf(figures: RetireComparisonResult): RetireModel {
    const isComparable = !isNotComparable(figures);
    return {
        basis: RETIRE_BASIS_TEXT[figures.basis],
        isComparable,
        keepRate: perDayText(figures.keepRate),
        liveTransferNotes: retireLiveTransferLinesOf(figures),
        note: RETIRE_NOTE,
        reason:
            figures.reason === null ? null : RETIRE_REASON_TEXT[figures.reason],
        remainingDays: `${figures.remainingDays.toLocaleString('en-US')} days`,
        switchCost: formatCurrency(figures.switchCost),
        switchRate: perDayText(figures.switchRate),
        verdict: isComparable
            ? RETIRE_VERDICT_TEXT[figures.verdict]
            : retireNotComparableVerdictOf(figures),
    };
}

function retireNotComparableVerdictOf(
    figures: RetireComparisonResult,
): string {
    if (figures.isSlotRateHazardFree !== true) {
        return RETIRE_NOT_COMPARABLE_TRIGGER_VERDICT_TEXT;
    }
    return figures.isSlotRateTriggerFree === true
        ? RETIRE_NOT_COMPARABLE_HAZARD_AND_TRIGGER_VERDICT_TEXT
        : RETIRE_NOT_COMPARABLE_HAZARD_VERDICT_TEXT;
}

function valueChainSlotOf(
    engine: SlotEngine,
    request: OverviewRequest,
): EngineSlot<ValueChainFigures> {
    return engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.ValueChain ? result.figures : null,
    );
}
