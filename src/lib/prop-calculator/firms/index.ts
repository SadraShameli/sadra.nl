import {
    FirmId,
    type LiveCushionPercent,
    type LivePlan,
    type TradingFirm,
} from '../core';
import { AlphaFutures } from './alphafutures/AlphaFutures';
import { buildAlphaFuturesLivePlan } from './alphafutures/AlphaFuturesLive';
import { buildApexLivePlan } from './apex/ApexLive';
import { ApexTraderFunding } from './apex/ApexTraderFunding';
import { E8Futures } from './e8futures/E8Futures';
import { FundedNext } from './fundednext/FundedNext';
import { buildFundedNextLivePlan } from './fundednext/FundedNextLive';
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
];

export type LivePlanBuilder = (cushionPercent: LiveCushionPercent) => LivePlan;

export function findFirm(id: FirmId): TradingFirm | undefined {
    return ALL_FIRMS.find((f) => f.id === id);
}

export const LIVE_PLAN_BUILDERS: ReadonlyMap<FirmId, LivePlanBuilder> = new Map(
    [
        [FirmId.AlphaFutures, buildAlphaFuturesLivePlan],
        [FirmId.Apex, buildApexLivePlan],
        [FirmId.FundedNext, buildFundedNextLivePlan],
        [FirmId.Mffu, buildMffuRapidLivePlan],
        [FirmId.TopStep, buildTopStepLivePlan],
        [FirmId.Tpt, buildTptLivePlan],
        [FirmId.Tradeify, buildTradeifyLivePlan],
    ],
);

export function findLivePlanBuilder(id: FirmId): LivePlanBuilder | undefined {
    return LIVE_PLAN_BUILDERS.get(id);
}

export { AlphaFutures } from './alphafutures/AlphaFutures';
export {
    ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
    buildAlphaFuturesLivePlan,
} from './alphafutures/AlphaFuturesLive';
export {
    APEX_LIVE_DEFAULT_CUSHION_PERCENT,
    buildApexLivePlan,
} from './apex/ApexLive';
export { ApexTraderFunding } from './apex/ApexTraderFunding';
export { E8Futures } from './e8futures/E8Futures';
export { FundedNext } from './fundednext/FundedNext';
export {
    buildFundedNextLivePlan,
    FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
} from './fundednext/FundedNextLive';
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
