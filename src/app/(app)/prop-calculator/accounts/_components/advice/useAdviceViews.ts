'use client';

import { useMemo } from 'react';

import { type Plan, TradingPhase } from '~/lib/prop-calculator';
import { type RiskDisplayUnit } from '~/lib/prop-calculator/advisor';

import {
    type AdviceValueView,
    adviceValueViewOf,
    adviceWithValues,
} from './adviceValueModel';
import { adviceViewModel, type PersonalLimits } from './adviceViewModel';
import {
    AccountAdvicePhase,
    type AccountAdviceState,
    AdviceValuesPhase,
} from './useAccountAdvice';

export interface AdviceViews {
    readonly valueView: AdviceValueView;
    readonly view: ReturnType<typeof adviceViewModel>;
}

export function useAdviceViews({
    adviceState,
    limits,
    phase,
    plan,
    riskUnit,
}: {
    readonly adviceState: AccountAdviceState;
    readonly limits: PersonalLimits;
    readonly phase: null | TradingPhase;
    readonly plan: Plan;
    readonly riskUnit: RiskDisplayUnit;
}): AdviceViews | null {
    const advice =
        adviceState.phase === AccountAdvicePhase.Ready
            ? adviceState.advice
            : null;
    const outcome =
        adviceState.phase === AccountAdvicePhase.Ready &&
        adviceState.values.phase === AdviceValuesPhase.Ready
            ? adviceState.values.result
            : null;
    return useMemo(() => {
        if (advice === null) return null;
        const valueView = adviceValueViewOf({
            context: {
                phase: phase ?? TradingPhase.Funded,
                plan,
                unit: riskUnit,
            },
            documentedRisk: advice.dailyPlanCard?.rungs[0]?.risk ?? null,
            outcome,
        });
        return {
            valueView,
            view: adviceViewModel(adviceWithValues(advice, valueView), limits),
        };
    }, [advice, limits, outcome, phase, plan, riskUnit]);
}
