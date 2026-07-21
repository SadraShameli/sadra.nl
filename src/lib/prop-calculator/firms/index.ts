import { type FirmId, type TradingFirm } from '../core';
import { AlphaFutures } from './alphafutures/AlphaFutures';
import { ApexTraderFunding } from './apex/ApexTraderFunding';
import { FundedNext } from './fundednext/FundedNext';
import { LucidTrading } from './lucid/LucidTrading';
import { MyFundedFutures } from './mffu/MyFundedFutures';
import { TopStep } from './topstep/TopStep';
import { TakeProfitTrader } from './tpt/TakeProfitTrader';
import { Tradeify } from './tradeify/Tradeify';

export const ALL_FIRMS: readonly TradingFirm[] = [
    new ApexTraderFunding(),
    new TakeProfitTrader(),
    new Tradeify(),
    new LucidTrading(),
    new MyFundedFutures(),
    new TopStep(),
    new FundedNext(),
    new AlphaFutures(),
];

export function findFirm(id: FirmId): TradingFirm | undefined {
    return ALL_FIRMS.find((f) => f.id === id);
}

export { AlphaFutures } from './alphafutures/AlphaFutures';
export { ApexTraderFunding } from './apex/ApexTraderFunding';
export { FundedNext } from './fundednext/FundedNext';
export { LucidTrading } from './lucid/LucidTrading';
export { MyFundedFutures } from './mffu/MyFundedFutures';
export { TopStep } from './topstep/TopStep';
export { TakeProfitTrader } from './tpt/TakeProfitTrader';
export { Tradeify } from './tradeify/Tradeify';
