import {
    formatConjunctionList,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    ContractLimitKind,
    formatOneContractRisk,
    formatWholeCentDollars,
    FUNDED_START_TIER_CONTRACT_LIMIT,
    fundedContractLimit,
    placedFundedRiskAt,
    type Plan,
    type PositionSizingConfig,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import {
    resolveCopyAccounts,
    SIM_DEFAULTS,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator/simulator';

import {
    type BuiltFundedCandidates,
    fundedPlacementText,
} from './FundedCandidate';
import { FundedSortKey, survivorCount } from './FundedCandidateSweep';

export const FUNDED_ROW_HEADERS: readonly string[] = [
    'funded policy',
    'per-cycle net',
    'horizon credit',
    'monthly net',
    'monthly ex-credit',
    'bust when funded',
    'survivors',
];

export function belowOneContractClause(
    positionSizing: PositionSizingConfig,
): string {
    return `below one ${positionSizing.instrument.symbol} contract's risk at a ${positionSizing.stopPoints} point stop (${formatOneContractRisk(positionSizing)})`;
}

export function flatsBelowOneContractNote(
    dollars: readonly number[],
    positionSizing: null | PositionSizingConfig,
): null | string {
    return positionSizing === null || dollars.length === 0
        ? null
        : `flat ${wholeCentList(dollars)} left out: ${belowOneContractClause(positionSizing)}, and funded flat risk is rounded down to whole contracts, never up`;
}

export function fundedPlacementNotes(
    build: Pick<BuiltFundedCandidates, 'flatsBelowOneContract' | 'placedFlats'>,
    positionSizing: PositionSizingConfig,
    plan: Plan,
): string[] {
    const belowOneContract = flatsBelowOneContractNote(
        build.flatsBelowOneContract,
        positionSizing,
    );
    return [
        ...(belowOneContract === null ? [] : [belowOneContract]),
        `flat, percent and ladder rows are placed in whole ${positionSizing.instrument.symbol} contracts at a ${positionSizing.stopPoints} point stop; a flat or ladder label shows the placement at ${FUNDED_START_TIER_CONTRACT_LIMIT} (a tiered plan can place more later), and the affordable room can cut it further`,
        ...collapsedFlatNotes(build.placedFlats, positionSizing, plan),
    ];
}

export function fundedRowCells(
    label: string,
    out: SimOutputs,
    trials: number,
): string[] {
    return [
        label,
        formatCurrency(out.expectedNet),
        formatCurrency(out.expectedHorizonCredit),
        formatCurrency(out.expectedMonthlyNet),
        formatCurrency(out.expectedMonthlyRealizedNet),
        formatPercent(out.fundedBustProbability),
        `${survivorCount(out, trials)}/${trials}`,
    ];
}

export function fundedRowStandardErrors(
    out: Pick<SimOutputs, 'estimates'>,
    trials: number,
): (null | string)[] {
    const { estimates } = out;
    return [
        null,
        formatCurrency(estimates.expectedNet.standardError),
        formatCurrency(estimates.expectedHorizonCredit.standardError),
        formatCurrency(estimates.expectedMonthlyNet.standardError),
        formatCurrency(estimates.expectedMonthlyRealizedNet.standardError),
        formatPercent(estimates.fundedBustProbability.standardError),
        (estimates.fundedSurvivalProbability.standardError * trials).toFixed(1),
    ];
}

export function fundedSortDescription(
    sort: FundedSortKey,
    base: SimInputs,
): string {
    switch (sort) {
        case FundedSortKey.Cycle: {
            return `  ranked by per-cycle expected net for THIS run only (${base.maxEvalDays}-day eval cap + ${base.fundedHorizonDays}-day funded horizon, no assumption you repeat this indefinitely)\n`;
        }
        case FundedSortKey.Monthly: {
            const rebuyLagDays = base.rebuyLagDays ?? SIM_DEFAULTS.rebuyLagDays;
            const copyAccounts = resolveCopyAccounts(base.copyAccounts);
            const slots =
                copyAccounts > 1
                    ? `${copyAccounts} copy-traded account slots together (the per-cycle net, horizon credit and monthly figures are one slot x ${copyAccounts})`
                    : 'one account slot';
            return `  ranked by steady-state expected net per month for ${slots}: monthly net = (per-cycle net + horizon credit) x ${TRADING_DAYS_PER_MONTH} / slot days, where slot days are the expected days per run (slot refilled after every failed eval, funded bust or ${base.fundedHorizonDays}-day horizon end, plus ${rebuyLagDays} rebuy-lag-days of empty slot time per eval attempt); the horizon credit is one more payout request for an account still open at the horizon, net of the split and the payout method fee: its withdrawable balance capped by the ladder step, request size, profit share and request caps, and capped by the payout profit pool (cycle profit since funding, a funded reset or the last payout on cycle-pool plans, account profit on account-profit plans) only when there is no payout ladder and no payout profit share; a payout ladder that denies an unaffordable step credits 0 when the step is above what the account could withdraw (its withdrawable balance, or its profit share if lower), and the credit is 0 once a lifetime payout cap is reached or the payout ladder is exhausted; the credit ignores the payout day and qualifying-day gate, the consistency rule, the minimum payout profit and the minimum request, since continued trading would clear them; monthly ex-credit = per-cycle net x ${TRADING_DAYS_PER_MONTH} / slot days, leaving the horizon credit out\n`;
        }
    }
}

export function fundedSurvivorsNote(trials: number): string {
    return `  survivors = trials (out of ${trials}) that passed eval and never busted funded (reached the horizon or the account concluded) -- a result backed by very few survivors is driven by a small, noisy sample and should not be trusted at face value\n`;
}

export function ladderRungsBelowOneContractText(
    rungs: readonly number[],
    positionSizing: PositionSizingConfig,
): string {
    return `${wholeCentList(rungs)} ${belowOneContractClause(positionSizing)}, and funded ladder rungs are rounded down to whole contracts, never up. Raise the rung, or use a micro instrument or a tighter stop.`;
}

function collapsedFlatNotes(
    dollars: readonly number[],
    positionSizing: PositionSizingConfig,
    plan: Plan,
): string[] {
    if (hasTieredFundedContractLimit(plan, positionSizing)) return [];
    const groups = Map.groupBy(dollars, (dollar) =>
        fundedPlacementText(
            [placedFundedRiskAt(dollar, positionSizing, plan)],
            positionSizing,
        ),
    );
    return [...groups]
        .filter(([, group]) => group.length > 1)
        .map(
            ([placement, group]) =>
                `flat ${formatConjunctionList(group.map((dollar) => formatWholeCentDollars(dollar)))} place the same ${placement}, so their rows are one policy`,
        );
}

function hasTieredFundedContractLimit(
    plan: Plan,
    positionSizing: PositionSizingConfig,
): boolean {
    return (
        fundedContractLimit(
            plan.contractLimits,
            positionSizing.instrument.isMicro,
        )?.kind === ContractLimitKind.Tiered
    );
}

function wholeCentList(dollars: readonly number[]): string {
    return dollars.map((dollar) => formatWholeCentDollars(dollar)).join(', ');
}
