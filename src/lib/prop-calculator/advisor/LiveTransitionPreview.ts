import {
    dollars,
    type Dollars,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP } from '~/lib/prop-calculator/firms';

import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    type LiveApplicabilityNote,
    LiveNotModeledReason,
    livePlanApplicability,
    type LiveStartRange,
    type LiveStateApproximation,
    type ModeledLiveBuilder,
    type ModeledLiveTransition,
} from './LivePlanApplicability';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from './ReconstructedAccount';

export enum LiveTransitionPreviewGap {
    NoFundedState = 'no-funded-state',
    NoPayoutBuffer = 'no-payout-buffer',
    NoTransitionModel = 'no-transition-model',
}

export enum LiveTransitionPreviewKind {
    DocumentedLiveStart = 'documented-live-start',
    LucidDailyCredit = 'lucid-daily-credit',
    NotModeled = 'not-modeled',
}

export interface DocumentedLiveStartPreview {
    readonly approximation: LiveStateApproximation | null;
    readonly isApproximation: boolean;
    readonly isInertAtAccountSize: boolean;
    readonly kind: LiveTransitionPreviewKind.DocumentedLiveStart;
    readonly note: LiveApplicabilityNote | null;
    readonly range: LiveStartRange;
    readonly startingBalance: Dollars;
}

export type LiveTransitionPreview =
    | DocumentedLiveStartPreview
    | LiveTransitionPreviewNotModeled
    | LucidDailyCreditPreview;

export interface LiveTransitionPreviewNotModeled {
    readonly kind: LiveTransitionPreviewKind.NotModeled;
    readonly reason: LiveNotModeledReason | LiveTransitionPreviewGap;
}

export interface LucidDailyCreditPreview {
    readonly buffer: Dollars;
    readonly cap: Dollars;
    readonly creditGross: Dollars;
    readonly creditNet: Dollars;
    readonly isApproximation: boolean;
    readonly isCapped: boolean;
    readonly kind: LiveTransitionPreviewKind.LucidDailyCredit;
    readonly note: LiveApplicabilityNote | null;
    readonly simProfitAboveBuffer: Dollars;
}

export function liveTransitionPreview(
    plan: Plan,
    account: null | ReconstructedAccount,
): LiveTransitionPreview {
    const applicability = livePlanApplicability(plan.id);
    if (applicability.kind === LiveApplicabilityKind.NotModeled) {
        return notModeled(applicability.reason);
    }
    if (account?.kind === ReconstructedLiveKind.Live) {
        return notModeled(LiveNotModeledReason.AlreadyLive);
    }
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            return documentedLiveStartPreview(plan, applicability);
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            return lucidDailyCreditPreview(plan, applicability, account);
        }
    }
}

function documentedLiveStartPreview(
    plan: Plan,
    applicability: ModeledLiveBuilder,
): LiveTransitionPreview {
    const { documentedStart } = applicability;
    if (documentedStart === null) {
        return notModeled(LiveTransitionPreviewGap.NoTransitionModel);
    }
    const range = documentedStart(plan.accountSize);
    return {
        approximation: applicability.approximation,
        isApproximation: isLiveModelApproximation(applicability),
        isInertAtAccountSize: range.lowest === range.highest,
        kind: LiveTransitionPreviewKind.DocumentedLiveStart,
        note: applicability.note,
        range,
        startingBalance: applicability.builder(
            applicability.defaultCushionPercent,
        ).startingBalance,
    };
}

function lucidDailyCreditPreview(
    plan: Plan,
    applicability: ModeledLiveTransition,
    account: null | ReconstructedAccount,
): LiveTransitionPreview {
    if (account?.kind !== TradingPhase.Funded) {
        return notModeled(LiveTransitionPreviewGap.NoFundedState);
    }
    if (plan.payoutBuffer === null) {
        return notModeled(LiveTransitionPreviewGap.NoPayoutBuffer);
    }
    const buffer = plan.payoutBuffer.requiredBalance(
        plan.accountSize,
        plan.fundedDrawdown.amount,
    );
    const simProfitAboveBuffer = dollars(
        Math.max(0, account.state.balance - buffer),
    );
    const livePlan = applicability.transitionBuilder(
        applicability.defaultCushionPercent,
        simProfitAboveBuffer,
    );
    return {
        buffer,
        cap: LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
        creditGross: livePlan.transitionPayout,
        creditNet: dollars(
            livePlan.payoutFromProfit(livePlan.transitionPayout),
        ),
        isApproximation: isLiveModelApproximation(applicability),
        isCapped: simProfitAboveBuffer > LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
        kind: LiveTransitionPreviewKind.LucidDailyCredit,
        note: applicability.note,
        simProfitAboveBuffer,
    };
}

function notModeled(
    reason: LiveNotModeledReason | LiveTransitionPreviewGap,
): LiveTransitionPreviewNotModeled {
    return { kind: LiveTransitionPreviewKind.NotModeled, reason };
}
