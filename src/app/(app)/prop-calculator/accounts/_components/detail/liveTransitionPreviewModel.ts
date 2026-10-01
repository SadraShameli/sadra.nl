import { formatCurrency } from '~/lib/format';
import {
    LiveApplicabilityNote,
    LiveNotModeledReason,
    LiveStateApproximation,
    type LiveTransitionPreview,
    LiveTransitionPreviewGap,
    LiveTransitionPreviewKind,
} from '~/lib/prop-calculator/advisor';

export enum LiveTransitionPreviewCardKind {
    Credit = 'credit',
    LiveStart = 'live-start',
    NotModeled = 'not-modeled',
}

export interface LiveTransitionPreviewCardModel {
    readonly caveats: readonly string[];
    readonly headline: string;
    readonly kind: LiveTransitionPreviewCardKind;
    readonly lines: readonly string[];
}

const NOT_MODELED_TEXT: Readonly<
    Record<LiveNotModeledReason | LiveTransitionPreviewGap, string>
> = {
    [LiveNotModeledReason.AlreadyLive]:
        'This account is already live, so there is no transition left to preview.',
    [LiveNotModeledReason.FirmRunsNoLiveProgram]:
        'This firm runs no live program, so there is no transition to preview.',
    [LiveNotModeledReason.LiveTermsUnpublished]:
        'The firm has not published its live terms, so the transition is not modeled.',
    [LiveNotModeledReason.NoStatedLivePath]:
        'The firm states no live path for this plan, so the transition is not modeled.',
    [LiveNotModeledReason.SeparateLiveProgram]:
        'The firm runs a separate live program for this plan, which is not modeled.',
    [LiveNotModeledReason.TerminalStage]:
        'This plan is the last stage and has no live transition to preview.',
    [LiveTransitionPreviewGap.NoFundedState]:
        'The transition credit needs a funded account with a recorded balance snapshot, so it cannot be previewed yet.',
    [LiveTransitionPreviewGap.NoPayoutBuffer]:
        'The plan has no payout buffer, so there is no profit above it to credit.',
    [LiveTransitionPreviewGap.NoTransitionModel]:
        'No live transition quantity is modeled for this plan, so there is nothing to preview.',
};

const NOTE_TEXT: Readonly<Partial<Record<LiveApplicabilityNote, string>>> = {
    [LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash]:
        'The credit is simulated profit above the buffer, paid out once at the transition. It is cash already earned, not income the live account will make.',
    [LiveApplicabilityNote.TopStepLfaEligibleJurisdictionAssumed]:
        'Assumes you are eligible for the TopStep Live Funded Account in your jurisdiction.',
};

const APPROXIMATION_TEXT: Readonly<Record<LiveStateApproximation, string>> = {
    [LiveStateApproximation.ReserveAndLfaProgressDefaulted]:
        'The reserve balance and the progress through the live scale-up are not stored, so defaults are used. This is an approximation.',
};

const UNVERIFIED_APPROXIMATION_TEXT =
    'This live model is a firm-level approximation, not verified for this exact plan.';

export function liveTransitionPreviewCardOf(
    preview: LiveTransitionPreview,
): LiveTransitionPreviewCardModel {
    switch (preview.kind) {
        case LiveTransitionPreviewKind.DocumentedLiveStart: {
            const { range } = preview;
            const caveats: string[] = [];
            const note = noteText(preview.note);
            if (note !== null) caveats.push(note);
            if (preview.approximation !== null) {
                caveats.push(APPROXIMATION_TEXT[preview.approximation]);
            } else if (preview.isApproximation) {
                caveats.push(UNVERIFIED_APPROXIMATION_TEXT);
            }
            return {
                caveats,
                headline: `The live account would start with ${formatCurrency(preview.startingBalance)} tradable.`,
                kind: LiveTransitionPreviewCardKind.LiveStart,
                lines: [
                    preview.isInertAtAccountSize
                        ? `At this account size the live start is always ${formatCurrency(range.highest)}, whatever your reserve balance, so the reserve balance does not change it.`
                        : `Between ${formatCurrency(range.lowest)} and ${formatCurrency(range.highest)}, depending on the reserve balance carried into the live account.`,
                ],
            };
        }
        case LiveTransitionPreviewKind.LucidDailyCredit: {
            const caveats: string[] = [];
            const note = noteText(preview.note);
            if (note !== null) caveats.push(note);
            if (preview.isApproximation) {
                caveats.push(UNVERIFIED_APPROXIMATION_TEXT);
            }
            const lines = [
                `Payout buffer: ${formatCurrency(preview.buffer)}. Balance above it: ${formatCurrency(preview.simProfitAboveBuffer)}.`,
                `Credit before the profit split: ${formatCurrency(preview.creditGross)}.`,
            ];
            if (preview.isCapped) {
                lines.push(
                    `The credit is capped at ${formatCurrency(preview.cap)}, one flat amount for all your Lucid Daily accounts together, so this account alone cannot exceed it.`,
                );
            }
            return {
                caveats,
                headline: `Transition credit: ${formatCurrency(preview.creditNet)} after the profit split.`,
                kind: LiveTransitionPreviewCardKind.Credit,
                lines,
            };
        }
        case LiveTransitionPreviewKind.NotModeled: {
            return {
                caveats: [],
                headline: NOT_MODELED_TEXT[preview.reason],
                kind: LiveTransitionPreviewCardKind.NotModeled,
                lines: [],
            };
        }
    }
}

function noteText(note: LiveApplicabilityNote | null): null | string {
    return note === null ? null : (NOTE_TEXT[note] ?? null);
}
