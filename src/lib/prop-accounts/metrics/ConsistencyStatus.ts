import {
    type ConsistencyRule,
    ConsistencyViolationEffect,
    type Plan,
} from '~/lib/prop-calculator';

const DOUBLE_TARGET_LABEL = 'target doubles';

export enum ConsistencyStatusKind {
    Evaluated = 'evaluated',
    NoRule = 'no-rule',
    NotEvaluated = 'not-evaluated',
}

export type ConsistencyStatus =
    | {
          readonly bestDayProfit: number;
          readonly isViolated: boolean;
          readonly kind: ConsistencyStatusKind.Evaluated;
          readonly rule: ConsistencyRule;
          readonly totalProfit: number;
          readonly violationEffectLabel: null | string;
      }
    | { readonly kind: ConsistencyStatusKind.NoRule }
    | { readonly kind: ConsistencyStatusKind.NotEvaluated; readonly rule: ConsistencyRule };

export function consistencyStatusOf(
    rule: ConsistencyRule | null,
    bestDayProfit: number | undefined,
    totalProfit: number,
): ConsistencyStatus {
    if (rule === null) return { kind: ConsistencyStatusKind.NoRule };
    if (bestDayProfit === undefined) {
        return { kind: ConsistencyStatusKind.NotEvaluated, rule };
    }
    return {
        bestDayProfit,
        isViolated: rule.isViolated(bestDayProfit, totalProfit),
        kind: ConsistencyStatusKind.Evaluated,
        rule,
        totalProfit,
        violationEffectLabel:
            rule.violationEffect === ConsistencyViolationEffect.DoubleTarget
                ? DOUBLE_TARGET_LABEL
                : null,
    };
}

export function evalConsistencyStatus(
    plan: Plan,
    evalBestDayProfit: number | undefined,
    totalProfit: number,
): ConsistencyStatus {
    return consistencyStatusOf(
        plan.evalConsistencyRule(),
        evalBestDayProfit,
        totalProfit,
    );
}

export function fundedConsistencyStatus(
    plan: Plan,
    payoutsIssued: number,
    cycleBestDayProfit: number | undefined,
    cycleProfit: number,
): ConsistencyStatus {
    return consistencyStatusOf(
        plan.fundedConsistencyRule(payoutsIssued),
        cycleBestDayProfit,
        cycleProfit,
    );
}
