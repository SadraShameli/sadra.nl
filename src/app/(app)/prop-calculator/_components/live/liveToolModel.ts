import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    effectivePayoutRequest,
    type InstrumentSymbol,
    type LiveSimInputs,
    payoutRequestSizeSchema,
    type Plan,
    serializePlanId,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    LiveNotModeledReason,
    livePlanApplicability,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

export enum LiveToolStatus {
    Modeled = 'modeled',
    NotModeled = 'not-modeled',
    Refused = 'refused',
}

export interface LiveToolCalculatorInputs {
    readonly instrument: InstrumentSymbol | null;
    readonly payoutRequestSize: null | number;
    readonly plan: Plan;
    readonly rrRatio: number;
    readonly seed: number;
    readonly stopPoints: null | number;
    readonly tradesPerDay: number;
    readonly winrate: number;
}

export type LiveToolModel =
    LiveToolModeled | LiveToolNotModeled | LiveToolRefused;

export interface LiveToolModeled {
    readonly hasCaveatNote: boolean;
    readonly note: null | string;
    readonly simInputs: LiveSimInputs;
    readonly status: LiveToolStatus.Modeled;
}

export interface LiveToolNotModeled {
    readonly message: string;
    readonly status: LiveToolStatus.NotModeled;
}

export interface LiveToolRefused {
    readonly message: string;
    readonly status: LiveToolStatus.Refused;
}

export type LiveToolRulebook = Pick<RulebookParameters, 'payout'>;

export const LIVE_TOOL_TRIALS = 200;

export const LIVE_TOOL_SIZING_REFUSAL =
    'Live sizing needs an instrument and a stop distance in points, so percent-of-cushion risk is placed in whole contracts. Set both in the inputs.';

export const LIVE_TOOL_CUSHION_REFUSAL =
    "This plan's live drawdown has no lock threshold to derive a retained cushion from, so live sizing cannot be modeled for it here.";

export const LIVE_TOOL_PAYOUT_REQUEST_REFUSAL =
    'Payout request size must be a positive dollar amount to size a live withdrawal. Set it above $0 in the inputs, or leave it blank to use the account rulebook default.';

export const LIVE_APPROXIMATION_NOTE =
    "This is a firm-level approximation of the live stage, not verified against this exact plan's own terms.";

const TRANSITION_CREDIT_ASSUMPTION_NOTE =
    'No one-off live transition credit is assumed here, since that depends on trading history a standalone simulation does not have.';

const LIVE_NOT_MODELED_REASON_TEXT: Readonly<
    Record<LiveNotModeledReason, string>
> = {
    [LiveNotModeledReason.AlreadyLive]:
        'this plan is itself a live account, so there is no separate live stage to simulate.',
    [LiveNotModeledReason.FirmRunsNoLiveProgram]:
        'this firm runs no live program for this plan.',
    [LiveNotModeledReason.LiveTermsUnpublished]:
        'this firm has not published live-account terms for this plan.',
    [LiveNotModeledReason.NoStatedLivePath]:
        'this plan has no stated path to a live account.',
    [LiveNotModeledReason.SeparateLiveProgram]:
        "this plan's live account runs on a separate program that this tool does not model.",
    [LiveNotModeledReason.TerminalStage]:
        'this plan is a terminal stage, so there is no further live account.',
};

export function buildLiveToolModel(
    inputs: LiveToolCalculatorInputs,
    rulebook: LiveToolRulebook,
): LiveToolModel {
    const applicability = livePlanApplicability(inputs.plan.id);
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            return modeledLiveTool(
                applicability.builder(applicability.defaultCushionPercent),
                inputs,
                rulebook,
                isLiveModelApproximation(applicability)
                    ? LIVE_APPROXIMATION_NOTE
                    : null,
            );
        }
        case LiveApplicabilityKind.NotModeled: {
            return {
                message: `No live stage modeled: ${LIVE_NOT_MODELED_REASON_TEXT[applicability.reason]}`,
                status: LiveToolStatus.NotModeled,
            };
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            const note = isLiveModelApproximation(applicability)
                ? `${LIVE_APPROXIMATION_NOTE} ${TRANSITION_CREDIT_ASSUMPTION_NOTE}`
                : TRANSITION_CREDIT_ASSUMPTION_NOTE;
            return modeledLiveTool(
                applicability.transitionBuilder(
                    applicability.defaultCushionPercent,
                    dollars(0),
                ),
                inputs,
                rulebook,
                note,
            );
        }
    }
}

export function liveToolModelCacheKey(
    inputs: LiveToolCalculatorInputs,
    rulebook: LiveToolRulebook,
): string {
    return JSON.stringify({
        instrument: inputs.instrument,
        payoutRequestSize: inputs.payoutRequestSize,
        planId: serializePlanId(inputs.plan.id),
        requestCents: rulebook.payout.requestCents,
        retainedCushionCents: rulebook.payout.retainedCushionCents,
        rrRatio: inputs.rrRatio,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints,
        tradesPerDay: inputs.tradesPerDay,
        winrate: inputs.winrate,
    });
}

export function modeledLiveTool(
    plan: LiveSimInputs['plan'],
    inputs: LiveToolCalculatorInputs,
    rulebook: LiveToolRulebook,
    note: null | string,
): LiveToolModel {
    if (inputs.instrument === null || inputs.stopPoints === null) {
        return {
            message: LIVE_TOOL_SIZING_REFUSAL,
            status: LiveToolStatus.Refused,
        };
    }
    const defaultCushion = defaultRetainedCushionOf(plan);
    if (defaultCushion === null) {
        return {
            message: LIVE_TOOL_CUSHION_REFUSAL,
            status: LiveToolStatus.Refused,
        };
    }
    const retainedCushion = dollars(
        Math.max(
            rulebook.payout.retainedCushionCents / CENTS_PER_DOLLAR,
            defaultCushion,
        ),
    );
    const requestedPayout =
        inputs.payoutRequestSize ??
        rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    if (!payoutRequestSizeSchema.safeParse(requestedPayout).success) {
        return {
            message: LIVE_TOOL_PAYOUT_REQUEST_REFUSAL,
            status: LiveToolStatus.Refused,
        };
    }
    const payoutRequestSize = effectivePayoutRequest(plan, requestedPayout);
    const simInputs: LiveSimInputs = {
        horizonDays: TRADING_DAYS_PER_YEAR,
        instrument: inputs.instrument,
        payoutRequestSize,
        plan,
        retainedCushion,
        rrRatio: inputs.rrRatio,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints,
        tradesPerDay: inputs.tradesPerDay,
        trials: LIVE_TOOL_TRIALS,
        winrate: inputs.winrate,
    };
    return {
        hasCaveatNote: note !== null,
        note,
        simInputs,
        status: LiveToolStatus.Modeled,
    };
}

function defaultRetainedCushionOf(plan: LiveSimInputs['plan']): Dollars | null {
    try {
        return plan.defaultRetainedCushion();
    } catch {
        return null;
    }
}
