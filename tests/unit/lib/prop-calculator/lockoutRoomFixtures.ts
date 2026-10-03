import { expect } from 'vitest';

import {
    AlphaFuturesVariant,
    ApexVariant,
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    E8FuturesVariant,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    FundedNextVariant,
    InstrumentSymbol,
    LucidVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    PolicySizing,
    resolveFundedTradeRisk,
    resolvePositionSizing,
    TopStepVariant,
    TradeifyVariant,
    wholeContractRisk,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator/simulator';

export const NQ_STOP_POINTS = 20;
export const FLAT_RISK = 800;
const GRANULARITY_TRIALS = 2000;
const MONTHLY_NET_RELATIVE_TOLERANCE = 0.1;
const MONTHLY_NET_ABSOLUTE_TOLERANCE = 50;
const FUNDED_BUST_TOLERANCE = 0.05;
export const HALF_CUSHION = fraction(0.5);
const FUNDED_TRADES_PER_DAY = 4;
const DAY_GREEN_STOP = { kind: DayStopRuleKind.DayGreen } as const;
const DAY_GREEN_LADDER = [800, 200, 100, 800] as const;
const ALTERNATING_LADDER = [800, 400, 800, 400] as const;
const INSTANT_FUNDED_LADDER = [FLAT_RISK] as const;

interface LockoutDllCase {
    readonly evalLadder: readonly number[];
    readonly id: PlanId;
}

export function expectNqAtOrBelowMnq(nq: SimOutputs, mnq: SimOutputs): void {
    expect(nq.expectedMonthlyNet).toBeLessThanOrEqual(
        mnq.expectedMonthlyNet +
            Math.max(
                MONTHLY_NET_ABSOLUTE_TOLERANCE,
                MONTHLY_NET_RELATIVE_TOLERANCE *
                    Math.abs(mnq.expectedMonthlyNet),
            ),
    );
    expect(nq.fundedBustProbability).toBeGreaterThanOrEqual(
        mnq.fundedBustProbability - FUNDED_BUST_TOLERANCE,
    );
}

export function halfCushionInWholeNqPolicy(): DayPolicy {
    const nq = resolvePositionSizing(InstrumentSymbol.NQ, NQ_STOP_POINTS);
    if (nq === null) throw new Error('NQ sizing did not resolve');
    return computedDayPolicy(
        (state) =>
            wholeContractRisk(
                resolveFundedTradeRisk(
                    state.balance - state.threshold,
                    HALF_CUSHION,
                ),
                nq,
                null,
            ),
        FUNDED_TRADES_PER_DAY,
        DAY_GREEN_STOP,
        PolicySizing.WholeContracts,
    );
}

export function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${id.firm} not found`);
    return plan;
}

export function stageDInputs(
    plan: Plan,
    evalLadder: readonly number[],
    instrument: InstrumentSymbol,
): SimInputs {
    return {
        commissionPerRoundTrip: 0,
        dayStop: DAY_GREEN_STOP,
        evalDayPolicy: {
            ladder: evalLadder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: DAY_GREEN_STOP,
        },
        fundedHorizonDays: 252,
        fundedRiskPerTrade: FLAT_RISK,
        idleDayProbability: 0,
        instrument,
        maxAttempts: 1,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan,
        rebuyLagDays: 0,
        riskPerTrade: evalLadder[0] ?? 0,
        rrRatio: 2,
        seed: 42,
        stopPoints: NQ_STOP_POINTS,
        tradesPerDay: FUNDED_TRADES_PER_DAY,
        trials: GRANULARITY_TRIALS,
        winrate: 0.4,
    };
}

export const LOCKOUT_DLL_CASES: readonly LockoutDllCase[] = [
    {
        evalLadder: DAY_GREEN_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
    },
    {
        evalLadder: ALTERNATING_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        },
    },
    {
        evalLadder: ALTERNATING_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        },
    },
    {
        evalLadder: [500, 800, 700],
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        },
    },
    {
        evalLadder: INSTANT_FUNDED_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        },
    },
    ...[
        LucidVariant.DailyEodDll,
        LucidVariant.DailyIntradayDll,
        LucidVariant.FlexDll,
        LucidVariant.Pro,
    ].map((variant) => ({
        evalLadder: ALTERNATING_LADDER,
        id: { accountSize: 50_000, firm: FirmId.Lucid, variant } as const,
    })),
    {
        evalLadder: INSTANT_FUNDED_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Direct,
        },
    },
    {
        evalLadder: DAY_GREEN_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Builder,
        },
    },
    ...[
        TopStepVariant.StandardStandardDll,
        TopStepVariant.StandardConsistencyDll,
        TopStepVariant.NoFeeStandardDll,
        TopStepVariant.NoFeeConsistencyDll,
    ].map((variant) => ({
        evalLadder: DAY_GREEN_LADDER,
        id: { accountSize: 50_000, firm: FirmId.TopStep, variant } as const,
    })),
    {
        evalLadder: INSTANT_FUNDED_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.ProAccount,
        },
    },
    ...[FundedNextVariant.RapidProDllAddOn, FundedNextVariant.RapidDaily].map(
        (variant) => ({
            evalLadder: DAY_GREEN_LADDER,
            id: {
                accountSize: 50_000,
                firm: FirmId.FundedNext,
                variant,
            } as const,
        }),
    ),
    {
        evalLadder: DAY_GREEN_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Zero,
        },
    },
    {
        evalLadder: ALTERNATING_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        },
    },
    {
        evalLadder: [800, 400, 800, 600],
        id: {
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        },
    },
    {
        evalLadder: [600, 800, 800, 600],
        id: {
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        },
    },
];
