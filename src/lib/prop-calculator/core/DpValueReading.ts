export interface DpTradeValue {
    readonly rewardRisk: number;
    readonly risk: number;
    readonly value: number;
    readonly valueAfterLoss: number;
    readonly valueAfterWin: number;
}

export interface DpValueReading {
    readonly bestRisk: number;
    readonly noTradeValue: number;
    readonly requested: readonly DpTradeValue[];
    readonly trades: readonly DpTradeValue[];
    readonly value: number;
}
