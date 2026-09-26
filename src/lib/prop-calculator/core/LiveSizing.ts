import { DailyLossLimitBreachEffect } from './DailyLossLimit';
import {
    type AffordableRoom,
    resolveAffordableRisk,
    resolveAffordableRoomWithin,
    resolveDailyLossRoom,
} from './DayPolicy';
import { type Fraction0to1 } from './lib/units';

export function capRiskToRemainingDailyLoss(
    risk: number,
    dailyLossLimit: null | number,
    todayPnL: number,
    commission: number,
): number {
    if (dailyLossLimit === null) return risk;
    const lossRoom = resolveAffordableRisk(
        Infinity,
        dailyLossLimit,
        todayPnL,
        commission,
    );
    return lossRoom <= 0 ? 0 : Math.min(risk, lossRoom);
}

export function resolveLiveAffordableRoom(
    cushion: number,
    dailyLossLimit: null | number,
    todayPnL: number,
    commission: number,
): AffordableRoom {
    const dailyLossRoom = resolveDailyLossRoom(
        dailyLossLimit,
        todayPnL,
        commission,
    );
    const affordable = resolveAffordableRoomWithin(
        cushion,
        dailyLossRoom,
        DailyLossLimitBreachEffect.Lockout,
    );
    return dailyLossRoom > 0 ? affordable : { ...affordable, room: 0 };
}

export function resolveLiveTradeRisk(
    cushion: number,
    cushionPercent: Fraction0to1,
): number {
    return cushion <= 0 ? 0 : cushionPercent * cushion;
}
