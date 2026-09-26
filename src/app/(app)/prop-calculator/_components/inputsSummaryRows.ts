import {
    formatCurrency,
    formatDays,
    formatPercent,
    formatRatio,
} from '~/lib/format';
import { describePlanOptIn, PlanOptIn } from '~/lib/prop-accounts';
import { DEFAULT_RUNG_SIZING, type RungSizing } from '~/lib/prop-calculator';

import { DayStopRuleStyle, describeDayStopRule } from './describeDayStopRule';
import { riskPercentToDollars } from './riskConversion';
import {
    RUNG_SIZING_LABELS,
    UNAFFORDABLE_RUNG_LABEL,
} from './rungSizingLabels';
import { type CalculatorState, SizingMode } from './types';

export enum InputsSummaryField {
    Firm = 'firm',
    FundedHorizon = 'funded-horizon',
    OptIns = 'opt-ins',
    Plan = 'plan',
    RewardToRisk = 'reward-to-risk',
    Risk = 'risk',
    RungSizing = 'rung-sizing',
    TradesPerDay = 'trades-per-day',
    Winrate = 'winrate',
}

export interface InputsSummaryRow {
    field: InputsSummaryField;
    label: string;
    value: string;
}

const PERCENT_RISK_DIGITS = 2;

export function describeAppliedEvalLadder(
    state: Pick<CalculatorState, 'evalDayPolicy'>,
): null | string {
    const policy = state.evalDayPolicy;
    if (policy === null) return null;
    const rungs = policy.ladder.map((rung) => formatCurrency(rung)).join(' / ');
    const lossCap =
        policy.maxLossesPerDay === null
            ? ''
            : `, at most ${policy.maxLossesPerDay} losses a day`;
    return `${rungs} per trade, ${describeDayStopRule(policy.stopRule, DayStopRuleStyle.Prose)}${lossCap}`;
}

export function describeNonDefaultRungSizing(
    rungSizing: RungSizing,
): null | string {
    return rungSizing === DEFAULT_RUNG_SIZING
        ? null
        : `${RUNG_SIZING_LABELS[rungSizing]}, eval and funded`;
}

export function inputsSummaryRows(state: CalculatorState): InputsSummaryRow[] {
    const rows: InputsSummaryRow[] = [
        {
            field: InputsSummaryField.Firm,
            label: 'Firm',
            value: state.firm.displayName,
        },
        {
            field: InputsSummaryField.Plan,
            label: 'Plan',
            value: state.plan.label,
        },
        {
            field: InputsSummaryField.OptIns,
            label: 'Opt-ins',
            value: describeOptIns(state),
        },
        {
            field: InputsSummaryField.Winrate,
            label: 'Winrate',
            value: formatPercent(state.winrate),
        },
        {
            field: InputsSummaryField.RewardToRisk,
            label: 'Reward to risk',
            value: formatRatio(state.rrRatio),
        },
        {
            field: InputsSummaryField.TradesPerDay,
            label: 'Trades per day',
            value: String(state.tradesPerDay),
        },
        {
            field: InputsSummaryField.Risk,
            label: 'Risk',
            value: describeRisk(state),
        },
        {
            field: InputsSummaryField.FundedHorizon,
            label: 'Funded horizon',
            value: formatDays(state.fundedHorizonDays),
        },
    ];
    const rungSizing = describeNonDefaultRungSizing(state.rungSizing);
    if (rungSizing !== null) {
        rows.push({
            field: InputsSummaryField.RungSizing,
            label: UNAFFORDABLE_RUNG_LABEL,
            value: rungSizing,
        });
    }
    return rows;
}

function describeOptIns(state: CalculatorState): string {
    const taken = takenOptIns(state);
    return taken.length === 0
        ? 'None'
        : taken.map((optIn) => describePlanOptIn(optIn)).join(', ');
}

function describeRisk(state: CalculatorState): string {
    switch (state.sizingMode) {
        case SizingMode.Dollar: {
            return `${formatCurrency(state.riskDollars)} per trade`;
        }
        case SizingMode.Percent: {
            const dollars = riskPercentToDollars(
                state.riskPercent,
                state.plan.accountSize,
            );
            return `${formatPercent(state.riskPercent / 100, PERCENT_RISK_DIGITS)} of account (${formatCurrency(dollars)}) per trade`;
        }
    }
}

function takenOptIns(state: CalculatorState): PlanOptIn[] {
    const taken: PlanOptIn[] = [];
    if (state.takesFundedReset) taken.push(PlanOptIn.FundedReset);
    if (state.takesOneTimeEarlyWithdrawal) {
        taken.push(PlanOptIn.OneTimeEarlyWithdrawal);
    }
    return taken;
}
