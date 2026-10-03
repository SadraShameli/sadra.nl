import { DailyLossLimitBreachEffect } from './DailyLossLimit';
import {
    type AffordableRoom,
    resolveAffordableRisk,
    resolveAffordableRoomWithin,
    resolveDailyLossRoom,
} from './DayPolicy';
import {
    type Fraction0to1,
    isAtOrBelowWithinCentTolerance,
} from './lib/units';

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

export function liftLiveSizingCushion(
    cushion: number,
    floorTradeRisk: number,
): number {
    return floorTradeRisk > 0 ? Math.max(cushion, floorTradeRisk) : cushion;
}

export function resolveLiveAffordableRoom(
    cushion: number,
    dailyLossLimit: null | number,
    todayPnL: number,
    commission: number,
    floorTradeRisk = 0,
): AffordableRoom {
    const dailyLossRoom = resolveDailyLossRoom(
        dailyLossLimit,
        todayPnL,
        commission,
    );
    const affordable = resolveAffordableRoomWithin(
        liftLiveSizingCushion(cushion, floorTradeRisk),
        dailyLossRoom,
        DailyLossLimitBreachEffect.Lockout,
    );
    return dailyLossRoom > 0 ? affordable : { ...affordable, room: 0 };
}

export function resolveLiveFloorTradeRisk(
    cushion: number,
    isFloorAlive: boolean,
    oneContractRisk: number,
): number {
    return isFloorAlive && isAtOrBelowWithinCentTolerance(cushion, 0)
        ? Math.max(0, oneContractRisk)
        : 0;
}

export function resolveLiveTradeRisk(
    cushion: number,
    cushionPercent: Fraction0to1,
): number {
    return cushion <= 0 ? 0 : cushionPercent * cushion;
}
