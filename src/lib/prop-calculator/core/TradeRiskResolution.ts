import { type AccountState } from './AccountState';
import {
    type AffordableRoom,
    placeWholeContractTrade,
    PolicySizing,
    resolveTradeRisk,
    RungSizing,
    type SizedTrade,
} from './DayPolicy';
import { type ContractCount, type Dollars } from './lib/units';
import { type LiveAccountState } from './LiveAccountState';
import { type LivePlan } from './LivePlan';
import {
    resolveLiveAffordableRoom,
    resolveLiveTradeRisk,
} from './LiveSizing';
import { type Plan } from './Plan';
import {
    capRiskToContractLimit,
    contractLimitAt,
    type PositionSizingConfig,
} from './PositionSizing';
import { applyTrade } from './TradingDayLedger';
import { type TradingPhase } from './TradingPhase';

export interface LiveTradeRiskOptions {
    readonly commission: Dollars;
    readonly plan: LivePlan;
    readonly positionSizing: PositionSizingConfig;
    readonly state: LiveAccountState;
}

export interface TradeRiskOptions {
    readonly commission: number;
    readonly intendedRisk: number;
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly positionSizing: null | PositionSizingConfig;
    readonly rungSizing: RungSizing;
    readonly sizing: PolicySizing;
    readonly state: AccountState;
}

export interface TradeRiskResult extends SizedTrade {
    readonly affordable: number;
    readonly maxContracts: ContractCount | null;
}

interface TradeSizingOptions {
    readonly affordable: AffordableRoom;
    readonly intendedRisk: number;
    readonly maxContracts: ContractCount | null;
    readonly positionSizing: PositionSizingConfig;
    readonly rungSizing: RungSizing;
    readonly sizing: PolicySizing;
}

export function applyClosedTrade(
    state: AccountState,
    plan: Plan,
    phase: TradingPhase,
    pnl: number,
    peakPnL?: number,
): void {
    applyTrade(plan, phase, state, pnl, peakPnL);
}

export function resolveLiveRiskAt(
    options: LiveTradeRiskOptions,
): SizedTrade {
    const { commission, plan, positionSizing, state } = options;
    const cushion = state.balance - state.threshold;
    const cushionPercent = plan.cushionPercentFor(state);
    const intendedRisk = resolveLiveTradeRisk(cushion, cushionPercent);
    const { kind: roomKind, room } = resolveLiveAffordableRoom(
        cushion,
        plan.dailyLossLimitFor(state),
        state.todayPnL,
        commission,
    );
    return placeWholeContractTrade({
        intendedRisk,
        maxContracts: plan.maxContractsFor(state, positionSizing.instrument),
        positionSizing,
        room,
        roomKind,
        rungSizing: RungSizing.CapToCushion,
    });
}

export function resolveRiskAt(options: TradeRiskOptions): TradeRiskResult {
    const {
        commission,
        intendedRisk,
        phase,
        plan,
        positionSizing,
        rungSizing,
        sizing,
        state,
    } = options;
    const affordable = plan.affordableRoom(state, phase, commission);
    const maxContracts =
        positionSizing === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  phase,
                  positionSizing.instrument.isMicro,
                  plan.tierProfitContext(state),
              );
    const sized =
        positionSizing === null
            ? unsizedTrade(
                  resolveTradeRisk(intendedRisk, affordable.room, rungSizing),
              )
            : sizeTrade({
                  affordable,
                  intendedRisk,
                  maxContracts,
                  positionSizing,
                  rungSizing,
                  sizing,
              });
    return { ...sized, affordable: affordable.room, maxContracts };
}

function sizeTrade(options: TradeSizingOptions): SizedTrade {
    const {
        affordable,
        intendedRisk,
        maxContracts,
        positionSizing,
        rungSizing,
        sizing,
    } = options;
    switch (sizing) {
        case PolicySizing.ContractCapped: {
            return unsizedTrade(
                resolveTradeRisk(
                    capRiskToContractLimit(
                        intendedRisk,
                        positionSizing,
                        maxContracts,
                    ),
                    affordable.room,
                    rungSizing,
                ),
            );
        }
        case PolicySizing.WholeContracts: {
            return placeWholeContractTrade({
                intendedRisk,
                maxContracts,
                positionSizing,
                room: affordable.room,
                roomKind: affordable.kind,
                rungSizing,
            });
        }
    }
}

function unsizedTrade(risk: number): SizedTrade {
    return { rewardRisk: risk, risk };
}
