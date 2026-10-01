import { payoutPathStepText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    overviewAccountRequestsFor,
    overviewPlanOptInsOf,
    type OverviewRequest,
    OverviewRequestKind,
    overviewRetireRequestsFor,
    overviewValueChainRequestsFor,
    type ValueChainFigures,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    type EngineSlot,
    EngineSlotKind,
    engineSlotOf,
    type SlotEngine,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import { formatCurrency } from '~/lib/format';
import { type Plan, serializePlanId, TradingPhase } from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    type DocumentedPolicySpec,
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

const RETIRE_NOTE =
    'Information only. This comparison never changes the next action on this account.';

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

const VALUE_CHAIN_STEP_LABEL: Readonly<Record<ValueChainStepKind, string>> = {
    [ValueChainStepKind.EvalStart]: 'Eval start',
    [ValueChainStepKind.FirstPayoutEligible]: 'First payout eligible',
    [ValueChainStepKind.FreshFunded]: 'Fresh funded',
    [ValueChainStepKind.PostFirstPayout]: 'Post first payout',
};


export enum ChainPositionViewKind {
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

export interface FromStateDetailInput {
    readonly input: AccountSnapshotInput;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
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
    readonly unavailable: readonly string[];
}

interface RetireModel {
    readonly basis: string;
    readonly keepRate: string;
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
        planSerial: serializePlanId(plan.id),
    };
    const [account] = overviewAccountRequestsFor([planInput], rulebook);
    const [retire] = overviewRetireRequestsFor([planInput], rulebook);
    const [chain] = overviewValueChainRequestsFor([planInput], rulebook);
    return account === undefined || chain === undefined || retire === undefined
        ? null
        : { account, chain, retire };
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
            return { kind: RetireViewKind.Ready, model: retireModelOf(slot.figures) };
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
    for (const step of chain.steps) {
        const label = VALUE_CHAIN_STEP_LABEL[step.kind];
        const { outcome } = step;
        if (outcome.kind === ValueChainStepOutcomeKind.Unavailable) {
            unavailable.push(`${label}: ${outcome.reason}`);
        } else if (
            valueNow.creditFree.value > outcome.value.creditFree.value
        ) {
            above.push(label);
        } else {
            below.push(label);
        }
    }
    return { above, below, unavailable };
}

function perDayText(rate: UncertainValue): string {
    const standardError =
        rate.standardError === null
            ? 'n/a'
            : formatCurrency(rate.standardError, 2);
    return `${formatCurrency(rate.value, 2)} per day (SE ${standardError})`;
}

function retireModelOf(figures: RetireComparisonResult): RetireModel {
    return {
        basis: RETIRE_BASIS_TEXT[figures.basis],
        keepRate: perDayText(figures.keepRate),
        note: RETIRE_NOTE,
        reason:
            figures.reason === null ? null : RETIRE_REASON_TEXT[figures.reason],
        remainingDays: `${figures.remainingDays.toLocaleString('en-US')} days`,
        switchCost: formatCurrency(figures.switchCost),
        switchRate: perDayText(figures.switchRate),
        verdict: RETIRE_VERDICT_TEXT[figures.verdict],
    };
}

function valueChainSlotOf(
    engine: SlotEngine,
    request: OverviewRequest,
): EngineSlot<ValueChainFigures> {
    return engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.ValueChain ? result.figures : null,
    );
}
