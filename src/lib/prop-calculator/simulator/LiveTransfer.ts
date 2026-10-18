import { formatPercent } from '~/lib/format';
import { type AccountState } from '~/lib/prop-calculator/core/AccountState';
import { type InstrumentSymbol } from '~/lib/prop-calculator/core/Instruments';
import {
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core/lib/units';
import { type LivePlan } from '~/lib/prop-calculator/core/LivePlan';
import { type Plan } from '~/lib/prop-calculator/core/Plan';
import {
    type PositionSizingConfig,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core/PositionSizing';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    LiveApplicabilityNote,
    livePlanApplicability,
} from '~/lib/prop-calculator/firms';
import { deriveSubSeed, mulberry32 } from '~/lib/prop-calculator/rng';

import {
    type LiveTransferContinuation,
    LiveTransferContinuationKind,
    type LiveTransferOptions,
} from './types';
import { assertPositiveFiniteNumber, assertProbability } from './validation';

const LIVE_TRANSFER_SEED_OFFSET = 0x4c_49_56_45;

export const LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT =
    'The live continuation ignores your funded day stop and rung sizing: it trades the live plan on its own sizing.';

export const LIVE_TRANSFER_CONTINUATION_TEXT: Readonly<
    Record<LiveTransferContinuationKind, string>
> = {
    [LiveTransferContinuationKind.Modeled]:
        'After a transfer the account continues through the modeled live plan; only its recurring withdrawals count in net and monthly net, while a transition credit, capital returned and a liquidation payout are separate and not counted.',
    [LiveTransferContinuationKind.ModeledApproximate]:
        'After a transfer the account continues through the modeled live plan, an approximation of the firm live terms (part of the live state is assumed); only its recurring withdrawals count in net and monthly net, while a transition credit, capital returned and a liquidation payout are separate and not counted.',
    [LiveTransferContinuationKind.NotModeled]:
        'No verified live plan is modeled here (or no instrument and stop points are set), so after a transfer the rest of the account is valued at $0.',
    [LiveTransferContinuationKind.Off]: '',
};

export const LIVE_TRANSFER_NOTE_TEXT: Readonly<
    Record<LiveApplicabilityNote, string>
> = {
    [LiveApplicabilityNote.AlphaPrimeNotModeled]:
        'This tool models the Alpha Futures Live Program path for the live plan and does not model the Alpha Prime Program path. It also does not model the Scaling Daily Loss Limit (30% of account) that the firm lists for both live programs.',
    [LiveApplicabilityNote.ApexUserPasteOnly]:
        'The Apex live terms this tool models rest on a pasted copy of the firm page and were not re-fetched live.',
    [LiveApplicabilityNote.FundedNextFlexTriggerConflict]:
        'This tool marks the FundedNext Flex live triggers as conflicting, so its live plan is unverified.',
    [LiveApplicabilityNote.FundedNextTwoQuoteInference]:
        'This tool marks the FundedNext live plan as inferred from two separate firm quotes, not from one stated rule.',
    [LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash]:
        "This tool treats the Lucid Daily transition credit as profit the simulated account already earned, not income the live account will make. It pays the credit net of the 90/10 split, which is this tool's own reading: the firm live page does not state a split for it, and the Lucid Daily Payouts and Funded Account articles state 90/10, for funded account payouts. The firm says the credit may be paid only after KYC with its broker partner and sub account approval.",
    [LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed]:
        'This tool marks the MFFU Rapid EOD live contract limit as disputed between firm sources, so the live contract limit it models may be wrong.',
    [LiveApplicabilityNote.TopStepLfaEligibleJurisdictionAssumed]:
        'This tool assumes you are eligible for the TopStep Live Funded Account in your jurisdiction.',
    [LiveApplicabilityNote.TptDevelopmentOnlyOnPlacement]:
        'This tool models a standard TPT PRO+ live account and does not model the PRO+ Development account the firm can place a trader in.',
};

export const LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT =
    'The payout that concludes an account is also a transfer chance at this hazard; that is a modeling choice, not a firm rule.';

const HAZARD_PERCENT_MAX_DIGITS = 8;
const HAZARD_PERCENT_TOLERANCE = 1e-9;

export interface LiveTransferDisclosure {
    readonly continuation: LiveTransferContinuationKind;
    readonly hazard: number;
    readonly notes: readonly string[];
    readonly sentLiveShare: null | number;
}

export interface LiveTransferSetup {
    readonly continuation: LiveTransferContinuation | null;
    readonly cumulativePayoutLimit: Dollars | null;
    readonly hazard: Fraction0to1;
    readonly kind: LiveTransferContinuationKind;
    readonly seed: number;
}

export interface LiveTransferSetupInputs {
    readonly commission: Dollars;
    readonly fundedRrRatio: number;
    readonly fundedTradesPerDay: number;
    readonly idleDayProbability: number | undefined;
    readonly instrument: InstrumentSymbol | undefined;
    readonly liveTransferHazard: Fraction0to1 | undefined;
    readonly minRetainedCushion: number | undefined;
    readonly payoutRequestSize: number | undefined;
    readonly plan: Plan;
    readonly seed: number;
    readonly stopPoints: number | undefined;
    readonly verifiedCumulativePayoutTrigger: number | undefined;
    readonly winrate: Fraction0to1;
}

interface ResolvedLivePlan {
    readonly isApproximate: boolean;
    readonly livePlanAt: (state: AccountState) => LivePlan;
}

export function liveTransferContinuationKindFor(
    plan: Plan,
    instrument: InstrumentSymbol | undefined,
    stopPoints: number | undefined,
): LiveTransferContinuationKind {
    return continuationKindOf(modeledLiveOf(plan, instrument, stopPoints));
}

export function liveTransferContinuationKindOf(
    setup: LiveTransferSetup | null,
): LiveTransferContinuationKind {
    return setup?.kind ?? LiveTransferContinuationKind.Off;
}

export function liveTransferContinuationNotes(
    plan: Plan,
    kind: LiveTransferContinuationKind,
): readonly string[] {
    switch (kind) {
        case LiveTransferContinuationKind.Modeled:
        case LiveTransferContinuationKind.ModeledApproximate: {
            const note = applicabilityNoteOf(plan);
            return [
                LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
                ...(note === null ? [] : [LIVE_TRANSFER_NOTE_TEXT[note]]),
            ];
        }
        case LiveTransferContinuationKind.NotModeled: {
            const note = unverifiedApplicabilityNoteOf(plan);
            return note === null ? [] : [LIVE_TRANSFER_NOTE_TEXT[note]];
        }
        case LiveTransferContinuationKind.Off: {
            return [];
        }
    }
}

export function liveTransferDisclosureLines(
    disclosure: LiveTransferDisclosure,
): readonly string[] {
    const { continuation, hazard, notes, sentLiveShare } = disclosure;
    return [
        `Live transfer: ${liveTransferHazardPercentText(hazard)} per paid payout (your assumption, not a firm rule).`,
        ...(sentLiveShare === null
            ? []
            : [liveTransferSentLiveText(sentLiveShare)]),
        LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
        LIVE_TRANSFER_CONTINUATION_TEXT[continuation],
        ...notes,
    ];
}

export function liveTransferHazardLines(
    plan: Plan,
    hazard: Fraction0to1,
    instrument: InstrumentSymbol | undefined,
    stopPoints: number | undefined,
    sentLiveShare: null | number = null,
): readonly string[] {
    const continuation = liveTransferContinuationKindFor(
        plan,
        instrument,
        stopPoints,
    );
    return liveTransferDisclosureLines({
        continuation,
        hazard,
        notes: liveTransferContinuationNotes(plan, continuation),
        sentLiveShare,
    });
}

export function liveTransferHazardPercentText(hazard: number): string {
    const percent = hazard * 100;
    for (let digits = 1; digits < HAZARD_PERCENT_MAX_DIGITS; digits += 1) {
        if (
            Math.abs(Number(percent.toFixed(digits)) - percent) <
            HAZARD_PERCENT_TOLERANCE
        ) {
            return `${percent.toFixed(digits)}%`;
        }
    }
    return `${percent.toFixed(HAZARD_PERCENT_MAX_DIGITS)}%`;
}

export function liveTransferOptionsFor(
    setup: LiveTransferSetup | null,
    trialIndex: number,
    groupIndex: number,
): LiveTransferOptions | undefined {
    if (setup === null) return undefined;
    return {
        continuation: setup.continuation,
        cumulativePayoutLimit: setup.cumulativePayoutLimit,
        hazard: setup.hazard,
        rng: mulberry32(deriveSubSeed(setup.seed, trialIndex, groupIndex)),
    };
}

export function liveTransferSentLiveText(share: number): string {
    return `${formatPercent(share)} of runs are sent live within the funded horizon.`;
}

export function resolveLiveTransferSetup(
    inputs: LiveTransferSetupInputs,
): LiveTransferSetup | null {
    const { liveTransferHazard, verifiedCumulativePayoutTrigger } = inputs;
    if (liveTransferHazard !== undefined) {
        assertProbability(liveTransferHazard, 'liveTransferHazard');
    }
    if (verifiedCumulativePayoutTrigger !== undefined) {
        assertPositiveFiniteNumber(
            verifiedCumulativePayoutTrigger,
            'verifiedCumulativePayoutTrigger',
        );
    }
    const hazard = liveTransferHazard ?? fraction(0);
    if (hazard === 0 && verifiedCumulativePayoutTrigger === undefined) {
        return null;
    }
    const continuation = continuationFor(inputs);
    return {
        continuation,
        cumulativePayoutLimit:
            verifiedCumulativePayoutTrigger === undefined
                ? null
                : dollars(verifiedCumulativePayoutTrigger),
        hazard,
        kind: liveTransferContinuationKindFor(
            inputs.plan,
            inputs.instrument,
            inputs.stopPoints,
        ),
        seed: inputs.seed + LIVE_TRANSFER_SEED_OFFSET,
    };
}

function applicabilityNoteOf(plan: Plan): LiveApplicabilityNote | null {
    const applicability = livePlanApplicability(plan.id);
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder:
        case LiveApplicabilityKind.TransitionBuilder: {
            return applicability.note;
        }
        case LiveApplicabilityKind.NotModeled: {
            return null;
        }
    }
}

function continuationFor(
    inputs: LiveTransferSetupInputs,
): LiveTransferContinuation | null {
    const modeled = modeledLiveOf(
        inputs.plan,
        inputs.instrument,
        inputs.stopPoints,
    );
    if (modeled === null) return null;
    const { livePlan, positionSizing } = modeled;
    return {
        commission: inputs.commission,
        idleDayProbability: inputs.idleDayProbability,
        livePlanAt: livePlan.livePlanAt,
        payoutRequestSize:
            inputs.payoutRequestSize === undefined
                ? undefined
                : dollars(inputs.payoutRequestSize),
        positionSizing,
        retainedCushion: inputs.minRetainedCushion,
        rrRatio: inputs.fundedRrRatio,
        tradesPerDay: inputs.fundedTradesPerDay,
        winrate: inputs.winrate,
    };
}

function continuationKindOf(
    modeled: null | { readonly livePlan: ResolvedLivePlan },
): LiveTransferContinuationKind {
    if (modeled === null) return LiveTransferContinuationKind.NotModeled;
    return modeled.livePlan.isApproximate
        ? LiveTransferContinuationKind.ModeledApproximate
        : LiveTransferContinuationKind.Modeled;
}

function livePlanResolverFor(plan: Plan): null | ResolvedLivePlan {
    const applicability = livePlanApplicability(plan.id);
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            if (!applicability.isVerified) return null;
            return {
                isApproximate: isLiveModelApproximation(applicability),
                livePlanAt: () =>
                    applicability.builder(applicability.defaultCushionPercent),
            };
        }
        case LiveApplicabilityKind.NotModeled: {
            return null;
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            const buffer = plan.payoutBufferBalance();
            if (buffer === null || !applicability.isVerified) return null;
            return {
                isApproximate: isLiveModelApproximation(applicability),
                livePlanAt: (state) =>
                    applicability.transitionBuilder(
                        applicability.defaultCushionPercent,
                        dollars(Math.max(0, state.balance - buffer)),
                    ),
            };
        }
    }
}

function modeledLiveOf(
    plan: Plan,
    instrument: InstrumentSymbol | undefined,
    stopPoints: number | undefined,
): null | {
    readonly livePlan: ResolvedLivePlan;
    readonly positionSizing: PositionSizingConfig;
} {
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const livePlan = livePlanResolverFor(plan);
    return positionSizing === null || livePlan === null
        ? null
        : { livePlan, positionSizing };
}

function unverifiedApplicabilityNoteOf(
    plan: Plan,
): LiveApplicabilityNote | null {
    const applicability = livePlanApplicability(plan.id);
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder:
        case LiveApplicabilityKind.TransitionBuilder: {
            return applicability.isVerified ? null : applicability.note;
        }
        case LiveApplicabilityKind.NotModeled: {
            return null;
        }
    }
}
