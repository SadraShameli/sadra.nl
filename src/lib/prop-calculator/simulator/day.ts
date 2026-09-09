import {
    type DayPolicy,
    DayStopRuleKind,
    flatDayPolicy,
    resolveTradeRisk,
    shouldStopDay,
} from '../core/DayPolicy';
import { type DayRunOptions, type SimInputs } from './types';

export function resolveDayPolicy(
    inputs: SimInputs,
    phase: 'eval' | 'funded',
): DayPolicy {
    const declared =
        phase === 'eval' ? inputs.evalDayPolicy : inputs.fundedDayPolicy;
    return (
        declared ??
        flatDayPolicy(
            inputs.riskPerTrade,
            inputs.tradesPerDay,
            inputs.dayStop ?? { kind: DayStopRuleKind.None },
        )
    );
}

export function runDay(options: DayRunOptions): {
    busted: boolean;
    traded: boolean;
} {
    const {
        commission,
        dayPolicy,
        phase,
        plan,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    } = options;
    state.todayHigh = state.balance;
    state.todayPnL = 0;
    let isTraded = false;
    let lossesToday = 0;

    for (const intendedRisk of dayPolicy.ladder) {
        const cushion = state.balance - state.threshold;
        const risk = resolveTradeRisk(intendedRisk, cushion, rungSizing);
        if (risk <= 0) break;

        const isWon = rng() < winrate;
        const tradeGross = isWon ? rrRatio * risk : -risk;
        const pnl = tradeGross - commission;
        state.balance += pnl;
        state.todayPnL += pnl;
        isTraded = true;
        if (state.balance > state.todayHigh) state.todayHigh = state.balance;
        stats.recordTrade(isWon, pnl, state.balance);
        if (!isWon) lossesToday += 1;
        plan.drawdown.onTrade(state, pnl);
        if (plan.isBust(state, phase)) {
            return { busted: true, traded: isTraded };
        }
        if (
            dayPolicy.maxLossesPerDay !== null &&
            lossesToday >= dayPolicy.maxLossesPerDay
        ) {
            break;
        }
        if (
            shouldStopDay(
                dayPolicy.stopRule,
                isWon,
                lossesToday,
                state.todayPnL,
            )
        ) {
            break;
        }
    }

    if (isTraded) {
        state.tradingDays += 1;
        if (state.todayPnL >= (plan.minQualifyingDayProfit ?? -Infinity)) {
            state.qualifyingDays += 1;
        }
    }
    plan.drawdown.onDayClose(state);
    if (isTraded && plan.isBust(state, phase)) {
        return { busted: true, traded: isTraded };
    }
    return { busted: false, traded: isTraded };
}
