'use client';

import { useMemo } from 'react';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { useToolRulebook } from '~/app/(app)/prop-calculator/_components/useToolRulebook';
import { type BankrollPlanVariantInputs } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { type RulebookParameters } from '~/lib/prop-calculator/advisor';

import { bankrollVariantFor } from './bankrollModel';
import { type RulebookSource } from './rulebookSource';

export interface BankrollVariant {
    readonly rulebook: RulebookParameters;
    readonly rulebookSource: RulebookSource;
    readonly variant: BankrollPlanVariantInputs;
}

export function useBankrollVariant(): BankrollVariant {
    const { state: calculatorState } = useCalculatorInputs();
    const { rulebook, source: rulebookSource } = useToolRulebook();
    const variant = useMemo(
        () => bankrollVariantFor(calculatorState, rulebook),
        [calculatorState, rulebook],
    );
    return { rulebook, rulebookSource, variant };
}
