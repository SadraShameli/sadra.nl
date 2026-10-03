import {
    type Dollars,
    FirmId,
    type LiveCushionPercent,
    type LivePlan,
    type TradingFirm,
} from '~/lib/prop-calculator/core';

import { AlphaFutures } from './alphafutures/AlphaFutures';
import { buildAlphaFuturesLivePlan } from './alphafutures/AlphaFuturesLive';
import { buildApexLivePlan } from './apex/ApexLive';
import { ApexTraderFunding } from './apex/ApexTraderFunding';
import { E8Futures } from './e8futures/E8Futures';
import { FtmoFutures } from './ftmo-futures/FtmoFutures';
import { FundedNext } from './fundednext/FundedNext';
import { buildFundedNextLivePlan } from './fundednext/FundedNextLive';
import { buildLucidDailyLivePlan, buildLucidLivePlan } from './lucid/LucidLive';
import { LucidTrading } from './lucid/LucidTrading';
import { buildMffuRapidLivePlan } from './mffu/MffuRapidLive';
import { MyFundedFutures } from './mffu/MyFundedFutures';
import { TopStep } from './topstep/TopStep';
import { buildTopStepLivePlan } from './topstep/TopStepLive';
import { TakeProfitTrader } from './tpt/TakeProfitTrader';
import { buildTptLivePlan } from './tpt/TptLive';
import { Tradeify } from './tradeify/Tradeify';
import { buildTradeifyLivePlan } from './tradeify/TradeifyLive';

export const ALL_FIRMS: readonly TradingFirm[] = [
    new ApexTraderFunding(),
    new TakeProfitTrader(),
    new Tradeify(),
    new LucidTrading(),
    new MyFundedFutures(),
    new TopStep(),
    new FundedNext(),
    new AlphaFutures(),
    new E8Futures(),
    new FtmoFutures(),
];

export type LivePlanBuilder = (cushionPercent: LiveCushionPercent) => LivePlan;

export type LiveTransitionPlanBuilder = (
    cushionPercent: LiveCushionPercent,
    simProfitAboveBuffer: Dollars,
) => LivePlan;

export function findFirm(id: FirmId): TradingFirm | undefined {
    return ALL_FIRMS.find((f) => f.id === id);
}

export const LIVE_PLAN_BUILDERS: ReadonlyMap<FirmId, LivePlanBuilder> = new Map(
    [
        [FirmId.AlphaFutures, buildAlphaFuturesLivePlan],
        [FirmId.Apex, buildApexLivePlan],
        [FirmId.FundedNext, buildFundedNextLivePlan],
        [FirmId.Lucid, buildLucidLivePlan],
        [FirmId.Mffu, buildMffuRapidLivePlan],
        [FirmId.TopStep, buildTopStepLivePlan],
        [FirmId.Tpt, buildTptLivePlan],
        [FirmId.Tradeify, buildTradeifyLivePlan],
    ],
);

export const LIVE_TRANSITION_PLAN_BUILDERS: ReadonlyMap<
    FirmId,
    LiveTransitionPlanBuilder
> = new Map([[FirmId.Lucid, buildLucidDailyLivePlan]]);

export function findLivePlanBuilder(id: FirmId): LivePlanBuilder | undefined {
    return LIVE_PLAN_BUILDERS.get(id);
}

export function findLiveTransitionPlanBuilder(
    id: FirmId,
): LiveTransitionPlanBuilder | undefined {
    return LIVE_TRANSITION_PLAN_BUILDERS.get(id);
}

export { AlphaFutures } from './alphafutures/AlphaFutures';
export {
    ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
    buildAlphaFuturesLivePlan,
} from './alphafutures/AlphaFuturesLive';
export {
    APEX_LIVE_DAILY_LOSS_LIMIT,
    APEX_LIVE_DEFAULT_CUSHION_PERCENT,
    buildApexLivePlan,
} from './apex/ApexLive';
export { ApexTraderFunding } from './apex/ApexTraderFunding';
export { E8Futures } from './e8futures/E8Futures';
export { FtmoFutures } from './ftmo-futures/FtmoFutures';
export { FundedNext } from './fundednext/FundedNext';
export {
    buildFundedNextLivePlan,
    FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
} from './fundednext/FundedNextLive';
export {
    type DocumentedLiveStart,
    isLiveModelApproximation,
    LiveApplicabilityKind,
    LiveApplicabilityNote,
    type LiveNotModeled,
    LiveNotModeledReason,
    type LivePlanApplicability,
    livePlanApplicability,
    LiveReconstructionAssumption,
    type LiveStartRange,
    LiveStateApproximation,
    type ModeledLiveBuilder,
    type ModeledLiveTransition,
} from './LivePlanApplicability';
export {
    buildLucidDailyLivePlan,
    buildLucidLivePlan,
    LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from './lucid/LucidLive';
export { LucidTrading } from './lucid/LucidTrading';
export {
    buildMffuRapidLivePlan,
    MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
} from './mffu/MffuRapidLive';
export { MyFundedFutures } from './mffu/MyFundedFutures';
export { TopStep } from './topstep/TopStep';
export {
    buildTopStepLivePlan,
    computeTopStepLiveStartingBalance,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    TOPSTEP_LIVE_LOWEST_CAPPED_BALANCE,
} from './topstep/TopStepLive';
export { TakeProfitTrader } from './tpt/TakeProfitTrader';
export {
    buildTptLiveDevelopmentPlan,
    buildTptLivePlan,
    TPT_LIVE_DEFAULT_CUSHION_PERCENT,
} from './tpt/TptLive';
export { Tradeify } from './tradeify/Tradeify';
export {
    buildTradeifyLivePlan,
    TRADEIFY_LIVE_DEFAULT_CUSHION_PERCENT,
} from './tradeify/TradeifyLive';
