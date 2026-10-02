import { resolveNextTrade } from '~/lib/prop-calculator/advisor/DocumentedRule';
import {
    NextTradeKind,
    SizingProvenance,
    type SizingTerms,
} from '~/lib/prop-calculator/advisor/DocumentedSizing';
import {
    NO_PERSONAL_CAPS,
    type PersonalCaps,
} from '~/lib/prop-calculator/advisor/PersonalCaps';
import {
    type DayProgress,
    type FundedRuleContext,
} from '~/lib/prop-calculator/advisor/RuleContext';
import { SizingStage } from '~/lib/prop-calculator/advisor/SizingStage';
import {
    type AccountState,
    computedDayPolicy,
    type ComputeRisk,
    type DayPolicy,
    DayStopRuleKind,
    type Dollars,
    dollars,
    ONE_CENT,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    resolveDayPolicy,
    SIM_DEFAULTS,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';

import {
    DayLedger,
    placeableMinimumFor,
    type SizingPlacement,
} from './DocumentedDayRisk';
import { type EnginePolicy, hasDayLimits } from './EnginePolicy';

const DAY_PNL_SCALE = 1_000_000;

export interface PersonalDayLimits {
    readonly dailyLossLimit: Dollars | null;
    readonly dailyProfitCap: Dollars | null;
}

interface DayTerms {
    readonly maxTrades: number;
    readonly placeableMinimum: Dollars;
    readonly rewardMultiple: number;
}

interface PersonalDayLimitsOptions {
    readonly commission: number;
    readonly placement?: SizingPlacement;
    readonly rewardMultiple: number;
}

export function applyPersonalDayLimits(
    policy: EnginePolicy,
    inputs: SimInputs,
): SimInputs {
    const limits = personalDayLimitsOfPolicy(policy);
    if (limits === null) return inputs;
    const commission =
        inputs.commissionPerRoundTrip ?? SIM_DEFAULTS.commissionPerRoundTrip;
    const placement = {
        instrument: inputs.instrument,
        stopPoints: inputs.stopPoints,
    };
    const evalDayPolicy = withPersonalDayLimits(
        resolveDayPolicy(inputs, TradingPhase.Eval),
        limits,
        { commission, placement, rewardMultiple: inputs.rrRatio },
    );
    const fundedDayPolicy = withPersonalDayLimits(
        resolveDayPolicy(inputs, TradingPhase.Funded),
        limits,
        {
            commission,
            placement,
            rewardMultiple: inputs.fundedRrRatio ?? inputs.rrRatio,
        },
    );
    return {
        ...inputs,
        evalDayPolicy,
        fundedCushionPercent: undefined,
        fundedDayPolicy,
        fundedRiskPerTrade: undefined,
        fundedTradesPerDay: undefined,
    };
}

export function ladderUnderPersonalDayLimits(
    ladder: readonly number[],
    limits: PersonalDayLimits,
    rewardMultiple: number,
): readonly number[] {
    const rungs: number[] = [];
    let runningLoss = 0;
    let openDayPnLs = new Set([0]);
    for (const planned of ladder) {
        const risk = limitedRisk(
            planned,
            {
                dayPnL: dollars(Math.max(...openDayPnLs) / DAY_PNL_SCALE),
                losses: rungs.length,
                runningLoss: dollars(runningLoss),
                wins: 0,
            },
            limits,
            {
                maxTrades: ladder.length,
                placeableMinimum: ONE_CENT,
                rewardMultiple,
            },
        );
        if (risk <= 0) break;
        rungs.push(risk);
        runningLoss += risk;
        openDayPnLs = openDayPnLsAfter(openDayPnLs, risk, rewardMultiple);
    }
    return rungs;
}

export function personalDayLimitsOf(
    caps: PersonalCaps | undefined,
    dailyLossLimit: Dollars | null | undefined,
): null | PersonalDayLimits {
    const limits: PersonalDayLimits = {
        dailyLossLimit: dailyLossLimit ?? null,
        dailyProfitCap: caps?.dailyProfitCap ?? null,
    };
    return limits.dailyLossLimit === null && limits.dailyProfitCap === null
        ? null
        : limits;
}

export function personalDayLimitsOfPolicy(
    policy: EnginePolicy,
): null | PersonalDayLimits {
    return hasDayLimits(policy)
        ? personalDayLimitsOf(policy.personalCaps, policy.personalDll)
        : null;
}

export function withPersonalDayLimits(
    base: DayPolicy,
    limits: PersonalDayLimits,
    options: PersonalDayLimitsOptions,
): DayPolicy {
    const { commission, placement = {}, rewardMultiple } = options;
    const maxTrades = base.ladder.length;
    const placeableMinimum = placeableMinimumFor(base.sizing, placement);
    const ledgers = new WeakMap<AccountState, DayLedger>();
    const computeRisk: ComputeRisk = (state, tradeIndexToday, fundedCycle) => {
        const ledger = ledgerAt(ledgers, state, tradeIndexToday, commission);
        const planned =
            base.computeRisk?.(state, tradeIndexToday, fundedCycle) ??
            base.ladder[tradeIndexToday] ??
            0;
        return limitedRisk(planned, ledger.progress, limits, {
            maxTrades,
            placeableMinimum,
            rewardMultiple,
        });
    };
    return {
        ...computedDayPolicy(
            computeRisk,
            maxTrades,
            base.stopRule,
            base.sizing,
        ),
        maxLossesPerDay: base.maxLossesPerDay,
    };
}

function contextOf(
    limits: PersonalDayLimits,
    placeableMinimum: Dollars,
): FundedRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(Infinity),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: {
            ...NO_PERSONAL_CAPS,
            dailyProfitCap: limits.dailyProfitCap,
        },
        personalDll: limits.dailyLossLimit,
        placeableMinimum,
        stage: SizingStage.Funded,
    };
}

function ledgerAt(
    ledgers: WeakMap<AccountState, DayLedger>,
    state: AccountState,
    tradeIndexToday: number,
    commission: number,
): DayLedger {
    if (tradeIndexToday === 0) {
        const fresh = new DayLedger(state.todayPnL);
        ledgers.set(state, fresh);
        return fresh;
    }
    const ledger = ledgers.get(state);
    if (ledger?.tradesSeen !== tradeIndexToday - 1) {
        throw new Error(
            `personal day limits: trade index ${tradeIndexToday} arrived without trade index ${tradeIndexToday - 1} of the same day`,
        );
    }
    ledger.record(state.todayPnL, commission);
    return ledger;
}

function limitedRisk(
    planned: number,
    progress: DayProgress,
    limits: PersonalDayLimits,
    terms: DayTerms,
): number {
    if (planned <= 0) return 0;
    const sizingTerms: SizingTerms = {
        assumptions: [],
        dailyProfitCap: null,
        maxTrades: terms.maxTrades,
        profitCeiling: null,
        provenance: SizingProvenance.GeneralDerivation,
        rewardMultiple: terms.rewardMultiple,
        sources: [],
        stopRule: { kind: DayStopRuleKind.None },
    };
    const trade = resolveNextTrade(
        contextOf(limits, terms.placeableMinimum),
        sizingTerms,
        progress,
        { amount: dollars(planned), cappedBy: [] },
    );
    switch (trade.kind) {
        case NextTradeKind.Stop: {
            return 0;
        }
        case NextTradeKind.Trade: {
            return trade.rung.cappedBy.length === 0 ? planned : trade.rung.risk;
        }
    }
}

function openDayPnLsAfter(
    openDayPnLs: ReadonlySet<number>,
    risk: number,
    rewardMultiple: number,
): Set<number> {
    const next = new Set<number>();
    for (const dayPnL of openDayPnLs) {
        next.add(dayPnL - Math.round(risk * DAY_PNL_SCALE));
        const afterWin =
            dayPnL + Math.round(risk * rewardMultiple * DAY_PNL_SCALE);
        if (afterWin <= 0) next.add(afterWin);
    }
    return next;
}
