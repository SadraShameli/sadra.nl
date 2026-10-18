import { formatCurrency } from '~/lib/format';
import { type DayStopRule, DayStopRuleKind } from '~/lib/prop-calculator';

export enum DayStopRuleStyle {
    Compact = 'compact',
    Prose = 'prose',
}

export const DAY_STOP_KIND_LABELS: Readonly<Record<DayStopRuleKind, string>> = {
    [DayStopRuleKind.AfterKLosses]: 'Stop after K losses',
    [DayStopRuleKind.AfterTarget]: 'Stop after $ target',
    [DayStopRuleKind.DayGreen]: 'Stop when day is green',
    [DayStopRuleKind.FirstWin]: 'Stop after first win',
    [DayStopRuleKind.None]: 'No stop',
};

export function describeDayStopRule(
    rule: DayStopRule,
    style: DayStopRuleStyle,
): string {
    switch (style) {
        case DayStopRuleStyle.Compact: {
            return compactDayStopRule(rule);
        }
        case DayStopRuleStyle.Prose: {
            return proseDayStopRule(rule);
        }
    }
}

function compactDayStopRule(rule: DayStopRule): string {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return `Stop ${rule.k}L`;
        }
        case DayStopRuleKind.AfterTarget: {
            return `Stop $${rule.dollars}`;
        }
        case DayStopRuleKind.DayGreen: {
            return 'Stop when green';
        }
        case DayStopRuleKind.FirstWin: {
            return 'Stop on win';
        }
        case DayStopRuleKind.None: {
            return 'Take all';
        }
    }
}

function proseDayStopRule(rule: DayStopRule): string {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return `stops after ${rule.k} ${rule.k === 1 ? 'loss' : 'losses'}`;
        }
        case DayStopRuleKind.AfterTarget: {
            return `stops at ${formatCurrency(rule.dollars)} of profit`;
        }
        case DayStopRuleKind.DayGreen: {
            return 'stops once the day is green';
        }
        case DayStopRuleKind.FirstWin: {
            return 'stops after the first win';
        }
        case DayStopRuleKind.None: {
            return 'no day stop';
        }
    }
}
