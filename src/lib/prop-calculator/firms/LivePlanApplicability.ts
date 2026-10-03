import {
    AlphaFuturesVariant,
    ApexVariant,
    type Dollars,
    E8FuturesVariant,
    FirmId,
    FtmoFuturesVariant,
    FundedNextVariant,
    type LiveCushionPercent,
    type LivePlan,
    LucidVariant,
    MffuVariant,
    type PlanId,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';

import type { LivePlanBuilder, LiveTransitionPlanBuilder } from './index';

import {
    ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
    buildAlphaFuturesLivePlan,
} from './alphafutures/AlphaFuturesLive';
import {
    APEX_LIVE_DEFAULT_CUSHION_PERCENT,
    buildApexLivePlan,
} from './apex/ApexLive';
import {
    buildFundedNextLivePlan,
    FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
} from './fundednext/FundedNextLive';
import {
    buildLucidDailyLivePlan,
    buildLucidLivePlan,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from './lucid/LucidLive';
import {
    buildMffuRapidLivePlan,
    MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
} from './mffu/MffuRapidLive';
import {
    buildTopStepLivePlan,
    computeTopStepLiveStartingBalance,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    TOPSTEP_LIVE_LOWEST_CAPPED_BALANCE,
} from './topstep/TopStepLive';
import {
    buildTptLivePlan,
    TPT_LIVE_DEFAULT_CUSHION_PERCENT,
} from './tpt/TptLive';
import {
    buildTradeifyLivePlan,
    TRADEIFY_LIVE_DEFAULT_CUSHION_PERCENT,
} from './tradeify/TradeifyLive';

export enum LiveApplicabilityKind {
    Builder = 'builder',
    NotModeled = 'not-modeled',
    TransitionBuilder = 'transition-builder',
}

export enum LiveApplicabilityNote {
    AlphaPrimeNotModeled = 'alpha-prime-not-modeled',
    ApexUserPasteOnly = 'apex-user-paste-only',
    FundedNextFlexTriggerConflict = 'fundednext-flex-trigger-conflict',
    FundedNextTwoQuoteInference = 'fundednext-two-quote-inference',
    LucidDailyTransitionPayoutIsPastCash = 'lucid-daily-transition-payout-is-past-cash',
    MffuRapidEodLiveContractLimitDisputed = 'mffu-rapid-eod-live-contract-limit-disputed',
    TopStepLfaEligibleJurisdictionAssumed = 'topstep-lfa-eligible-jurisdiction-assumed',
    TptDevelopmentOnlyOnPlacement = 'tpt-development-only-on-placement',
}

export enum LiveNotModeledReason {
    AlreadyLive = 'already-live',
    FirmRunsNoLiveProgram = 'firm-runs-no-live-program',
    LiveTermsUnpublished = 'live-terms-unpublished',
    NoStatedLivePath = 'no-stated-live-path',
    SeparateLiveProgram = 'separate-live-program',
    TerminalStage = 'terminal-stage',
}

export enum LiveReconstructionAssumption {
    TopStepLiveReserveDefaulted = 'topstep-live-reserve-defaulted',
}

export enum LiveStateApproximation {
    ReserveAndLfaProgressDefaulted = 'reserve-and-lfa-progress-defaulted',
}

export type DocumentedLiveStart = (accountSize: Dollars) => LiveStartRange;

export interface LiveNotModeled {
    readonly kind: LiveApplicabilityKind.NotModeled;
    readonly reason: LiveNotModeledReason;
}

export type LivePlanApplicability =
    LiveNotModeled | ModeledLiveBuilder | ModeledLiveTransition;

export interface LiveStartRange {
    readonly highest: Dollars;
    readonly lowest: Dollars;
}

export interface ModeledLiveBuilder {
    readonly approximation: LiveStateApproximation | null;
    readonly builder: (
        cushionPercent: LiveCushionPercent,
        reconstructionDefault?: Dollars,
    ) => LivePlan;
    readonly defaultCushionPercent: LiveCushionPercent;
    readonly documentedStart: DocumentedLiveStart | null;
    readonly isVerified: boolean;
    readonly kind: LiveApplicabilityKind.Builder;
    readonly note: LiveApplicabilityNote | null;
    readonly reconstructionDefault: Dollars | null;
    readonly reconstructionDefaultAssumption: LiveReconstructionAssumption | null;
}

export interface ModeledLiveTransition {
    readonly defaultCushionPercent: LiveCushionPercent;
    readonly isVerified: boolean;
    readonly kind: LiveApplicabilityKind.TransitionBuilder;
    readonly note: LiveApplicabilityNote | null;
    readonly transitionBuilder: LiveTransitionPlanBuilder;
}

interface ModeledLiveBuilderInit {
    readonly approximation?: LiveStateApproximation;
    readonly builder: LivePlanBuilder;
    readonly defaultCushionPercent: LiveCushionPercent;
    readonly documentedStart?: DocumentedLiveStart;
    readonly isVerified: boolean;
    readonly note?: LiveApplicabilityNote;
    readonly reconstructionDefault?: Dollars;
    readonly reconstructionDefaultAssumption?: LiveReconstructionAssumption;
}

type TptAccountSize = Extract<PlanId, { firm: FirmId.Tpt }>['accountSize'];

type VariantTable<Variant extends string> = Readonly<
    Record<Variant, LivePlanApplicability>
>;

function modeled(init: ModeledLiveBuilderInit): ModeledLiveBuilder {
    return Object.freeze({
        approximation: init.approximation ?? null,
        builder: init.builder,
        defaultCushionPercent: init.defaultCushionPercent,
        documentedStart: init.documentedStart ?? null,
        isVerified: init.isVerified,
        kind: LiveApplicabilityKind.Builder,
        note: init.note ?? null,
        reconstructionDefault: init.reconstructionDefault ?? null,
        reconstructionDefaultAssumption:
            init.reconstructionDefaultAssumption ?? null,
    });
}

function notModeled(reason: LiveNotModeledReason): LiveNotModeled {
    return Object.freeze({ kind: LiveApplicabilityKind.NotModeled, reason });
}

function topStepLfaStart(accountSize: Dollars): LiveStartRange {
    return {
        highest: computeTopStepLiveStartingBalance(accountSize, accountSize),
        lowest: computeTopStepLiveStartingBalance(
            TOPSTEP_LIVE_LOWEST_CAPPED_BALANCE,
            accountSize,
        ),
    };
}

const APEX_LIVE = modeled({
    builder: buildApexLivePlan,
    defaultCushionPercent: APEX_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
    note: LiveApplicabilityNote.ApexUserPasteOnly,
});

const ALPHAFUTURES_LIVE = modeled({
    builder: buildAlphaFuturesLivePlan,
    defaultCushionPercent: ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
    note: LiveApplicabilityNote.AlphaPrimeNotModeled,
});

const FUNDEDNEXT_LIVE = modeled({
    builder: buildFundedNextLivePlan,
    defaultCushionPercent: FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
    note: LiveApplicabilityNote.FundedNextTwoQuoteInference,
});

const LUCID_LIVE = modeled({
    builder: buildLucidLivePlan,
    defaultCushionPercent: LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
});

const LUCID_DAILY_LIVE: ModeledLiveTransition = Object.freeze({
    defaultCushionPercent: LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
    kind: LiveApplicabilityKind.TransitionBuilder,
    note: LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash,
    transitionBuilder: buildLucidDailyLivePlan,
});

const TOPSTEP_LFA = modeled({
    approximation: LiveStateApproximation.ReserveAndLfaProgressDefaulted,
    builder: buildTopStepLivePlan,
    defaultCushionPercent: TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    documentedStart: topStepLfaStart,
    isVerified: true,
    note: LiveApplicabilityNote.TopStepLfaEligibleJurisdictionAssumed,
    reconstructionDefaultAssumption: LiveReconstructionAssumption.TopStepLiveReserveDefaulted,
});

const TRADEIFY_ELITE_LIVE = modeled({
    builder: buildTradeifyLivePlan,
    defaultCushionPercent: TRADEIFY_LIVE_DEFAULT_CUSHION_PERCENT,
    isVerified: true,
});

const SEPARATE_LIVE_PROGRAM = notModeled(
    LiveNotModeledReason.SeparateLiveProgram,
);

const ALPHAFUTURES: VariantTable<AlphaFuturesVariant> = {
    [AlphaFuturesVariant.Advanced]: ALPHAFUTURES_LIVE,
    [AlphaFuturesVariant.Standard]: ALPHAFUTURES_LIVE,
    [AlphaFuturesVariant.Zero]: ALPHAFUTURES_LIVE,
};

const APEX: VariantTable<ApexVariant> = {
    [ApexVariant.Eod]: APEX_LIVE,
    [ApexVariant.Intraday]: APEX_LIVE,
};

const E8_NO_LIVE_PROGRAM = notModeled(
    LiveNotModeledReason.FirmRunsNoLiveProgram,
);

const E8FUTURES: VariantTable<E8FuturesVariant> = {
    [E8FuturesVariant.Signature]: E8_NO_LIVE_PROGRAM,
    [E8FuturesVariant.ZeroMax80]: E8_NO_LIVE_PROGRAM,
    [E8FuturesVariant.ZeroMax100]: E8_NO_LIVE_PROGRAM,
    [E8FuturesVariant.ZeroStarter80]: E8_NO_LIVE_PROGRAM,
    [E8FuturesVariant.ZeroStarter100]: E8_NO_LIVE_PROGRAM,
};

const FTMO_LIVE_TERMS_UNPUBLISHED = notModeled(
    LiveNotModeledReason.LiveTermsUnpublished,
);

const FTMOFUTURES: VariantTable<FtmoFuturesVariant> = {
    [FtmoFuturesVariant.Growth]: FTMO_LIVE_TERMS_UNPUBLISHED,
    [FtmoFuturesVariant.Pro]: FTMO_LIVE_TERMS_UNPUBLISHED,
};

const FUNDEDNEXT: VariantTable<FundedNextVariant> = {
    [FundedNextVariant.Flex]: modeled({
        builder: buildFundedNextLivePlan,
        defaultCushionPercent: FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
        isVerified: false,
        note: LiveApplicabilityNote.FundedNextFlexTriggerConflict,
    }),
    [FundedNextVariant.Fnl003]: notModeled(
        LiveNotModeledReason.NoStatedLivePath,
    ),
    [FundedNextVariant.Legacy]: SEPARATE_LIVE_PROGRAM,
    [FundedNextVariant.RapidDaily]: FUNDEDNEXT_LIVE,
    [FundedNextVariant.RapidPro]: FUNDEDNEXT_LIVE,
    [FundedNextVariant.RapidProDllAddOn]: FUNDEDNEXT_LIVE,
};

const LUCID: VariantTable<LucidVariant> = {
    [LucidVariant.DailyEod]: LUCID_DAILY_LIVE,
    [LucidVariant.DailyEodDll]: LUCID_DAILY_LIVE,
    [LucidVariant.DailyIntraday]: LUCID_DAILY_LIVE,
    [LucidVariant.DailyIntradayDll]: LUCID_DAILY_LIVE,
    [LucidVariant.Direct]: LUCID_LIVE,
    [LucidVariant.Flex]: LUCID_LIVE,
    [LucidVariant.FlexDll]: LUCID_LIVE,
    [LucidVariant.Maxx]: notModeled(LiveNotModeledReason.AlreadyLive),
    [LucidVariant.Pro]: LUCID_LIVE,
    [LucidVariant.ProNoDll]: LUCID_LIVE,
};

const MFFU: VariantTable<MffuVariant> = {
    [MffuVariant.Builder]: SEPARATE_LIVE_PROGRAM,
    [MffuVariant.Pro]: SEPARATE_LIVE_PROGRAM,
    [MffuVariant.Rapid]: modeled({
        builder: buildMffuRapidLivePlan,
        defaultCushionPercent: MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
        isVerified: true,
    }),
    [MffuVariant.RapidEod]: modeled({
        builder: buildMffuRapidLivePlan,
        defaultCushionPercent: MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
        isVerified: true,
        note: LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed,
    }),
};

const TOPSTEP: VariantTable<TopStepVariant> = {
    [TopStepVariant.NoFeeConsistency]: TOPSTEP_LFA,
    [TopStepVariant.NoFeeConsistencyDll]: TOPSTEP_LFA,
    [TopStepVariant.NoFeeStandard]: TOPSTEP_LFA,
    [TopStepVariant.NoFeeStandardDll]: TOPSTEP_LFA,
    [TopStepVariant.ProAccount]: notModeled(LiveNotModeledReason.TerminalStage),
    [TopStepVariant.StandardConsistency]: TOPSTEP_LFA,
    [TopStepVariant.StandardConsistencyDll]: TOPSTEP_LFA,
    [TopStepVariant.StandardStandard]: TOPSTEP_LFA,
    [TopStepVariant.StandardStandardDll]: TOPSTEP_LFA,
};

const TPT: Readonly<Record<TptAccountSize, LivePlanApplicability>> = {
    50_000: modeled({
        builder: buildTptLivePlan,
        defaultCushionPercent: TPT_LIVE_DEFAULT_CUSHION_PERCENT,
        isVerified: true,
        note: LiveApplicabilityNote.TptDevelopmentOnlyOnPlacement,
    }),
};

const TRADEIFY: VariantTable<TradeifyVariant> = {
    [TradeifyVariant.Growth]: TRADEIFY_ELITE_LIVE,
    [TradeifyVariant.Lightning]: TRADEIFY_ELITE_LIVE,
    [TradeifyVariant.SelectDaily]: TRADEIFY_ELITE_LIVE,
    [TradeifyVariant.SelectFlex]: TRADEIFY_ELITE_LIVE,
};

export function isLiveModelApproximation(
    applicability: LivePlanApplicability,
): boolean {
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            return (
                !applicability.isVerified ||
                applicability.approximation !== null
            );
        }
        case LiveApplicabilityKind.NotModeled: {
            return false;
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            return !applicability.isVerified;
        }
    }
}

export function livePlanApplicability(id: PlanId): LivePlanApplicability {
    switch (id.firm) {
        case FirmId.AlphaFutures: {
            return ALPHAFUTURES[id.variant];
        }
        case FirmId.Apex: {
            return APEX[id.variant];
        }
        case FirmId.E8Futures: {
            return E8FUTURES[id.variant];
        }
        case FirmId.FtmoFutures: {
            return FTMOFUTURES[id.variant];
        }
        case FirmId.FundedNext: {
            return FUNDEDNEXT[id.variant];
        }
        case FirmId.Lucid: {
            return LUCID[id.variant];
        }
        case FirmId.Mffu: {
            return MFFU[id.variant];
        }
        case FirmId.TopStep: {
            return TOPSTEP[id.variant];
        }
        case FirmId.Tpt: {
            return TPT[id.accountSize];
        }
        case FirmId.Tradeify: {
            return TRADEIFY[id.variant];
        }
    }
}
