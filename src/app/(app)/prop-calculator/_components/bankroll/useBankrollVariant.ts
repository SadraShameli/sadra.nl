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
import { type RulebookSource, rulebookSourceOf } from './rulebookSource';

export interface BankrollVariant {
    readonly rulebook: RulebookParameters;
    readonly rulebookSource: RulebookSource;
    readonly variant: BankrollPlanVariantInputs;
}

export function useBankrollVariant(): BankrollVariant {
    const { state: calculatorState } = useCalculatorInputs();
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const userRulebook = hasSession ? rulebookQuery.data : undefined;
    const rulebookSource = rulebookSourceOf({
        hasRulebook: userRulebook !== undefined,
        hasSession,
        isFailed: rulebookQuery.isError,
        isSessionFailed: session.error !== null,
        isSessionPending: session.isPending,
    });
    const rulebook = userRulebook ?? DEFAULT_RULEBOOK;
    const variant = useMemo(
        () => bankrollVariantFor(calculatorState, rulebook),
        [calculatorState, rulebook],
    );
    return { rulebook, rulebookSource, variant };
}
