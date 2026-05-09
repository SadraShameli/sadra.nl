import { type FirmId, type PropFirm } from '../core';
import { AlphaFutures } from './alphafutures/AlphaFutures';
import { ApexTraderFunding } from './apex/ApexTraderFunding';
import { FundedNext } from './fundednext/FundedNext';
import { LucidTrading } from './lucid/LucidTrading';
import { MyFundedFutures } from './mffu/MyFundedFutures';
import { TopStep } from './topstep/TopStep';
import { TakeProfitTrader } from './tpt/TakeProfitTrader';
import { Tradeify } from './tradeify/Tradeify';

export const ALL_FIRMS: readonly PropFirm[] = [
    new ApexTraderFunding(),
    new TakeProfitTrader(),
    new Tradeify(),
    new LucidTrading(),
    new MyFundedFutures(),
    new TopStep(),
    new FundedNext(),
    new AlphaFutures(),
];

export function findFirm(id: FirmId): PropFirm | undefined {
    return ALL_FIRMS.find((f) => f.id === id);
}

export {
    AlphaFutures,
    ApexTraderFunding,
    FundedNext,
    LucidTrading,
    MyFundedFutures,
    TakeProfitTrader,
    TopStep,
    Tradeify,
};
