'use client';

import { useMemo } from 'react';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { type BankrollPlanVariantInputs } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { useSession } from '~/lib/auth/client';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { api } from '~/trpc/react';

import { bankrollVariantFor } from './bankrollModel';

export interface BankrollVariant {
    readonly rulebook: RulebookParameters;
    readonly variant: BankrollPlanVariantInputs;
}

export function useBankrollVariant(): BankrollVariant {
    const { state: calculatorState } = useCalculatorInputs();
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const rulebook =
        hasSession && rulebookQuery.data !== undefined
            ? rulebookQuery.data
            : DEFAULT_RULEBOOK;
    const variant = useMemo(
        () => bankrollVariantFor(calculatorState, rulebook),
        [calculatorState, rulebook],
    );
    return { rulebook, variant };
}
