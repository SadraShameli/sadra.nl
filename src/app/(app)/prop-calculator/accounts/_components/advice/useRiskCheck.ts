'use client';

import { useMemo, useState } from 'react';

import { type SizingAdvisor } from '~/lib/prop-calculator/advisor';

import {
    EMPTY_RISK_CHECK_INPUTS,
    type RiskCheckDecision,
    type RiskCheckInputs,
    type RiskChecks,
    riskChecksOf,
} from './riskCheckModel';

export function useRiskCheck({
    advisor,
    decisions,
    today,
}: {
    readonly advisor: SizingAdvisor;
    readonly decisions: readonly RiskCheckDecision[];
    readonly today: string;
}): RiskChecks & {
    readonly inputs: RiskCheckInputs;
    readonly setInputs: (inputs: RiskCheckInputs) => void;
} {
    const [inputs, setInputs] = useState<RiskCheckInputs>(
        EMPTY_RISK_CHECK_INPUTS,
    );
    const checks = useMemo(
        () => riskChecksOf({ advisor, decisions, inputs, today }),
        [advisor, decisions, inputs, today],
    );
    return { ...checks, inputs, setInputs };
}
