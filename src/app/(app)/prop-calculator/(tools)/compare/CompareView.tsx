'use client';

import dynamic from 'next/dynamic';

import {
    type ObjectiveChoice,
    useCalculatorActions,
    useCalculatorInputs,
    useObjectiveChoice,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { CalculatorActionType } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import {
    ObjectiveChip,
    objectiveChoiceNotes,
} from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { useSession } from '~/lib/auth/client';
import { formatCurrency } from '~/lib/format';
import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator';
import {
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { api } from '~/trpc/react';

const PlanComparisonTable = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/PlanComparisonTable'),
    { loading: () => <PanelSkeleton /> },
);

const CopySplitSection = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/CopySplitSection'),
    { loading: () => <PanelSkeleton /> },
);

const FirmComparisonTable = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/FirmComparisonTable'),
    { loading: () => <PanelSkeleton /> },
);

export function CompareView() {
    const { firms, planOptIns, simInputs, state } = useCalculatorInputs();
    const { dispatch } = useCalculatorActions();
    const choice = useObjectiveChoice();
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const summaryQuery = api.propAccounts.bankroll.summary.useQuery(undefined, {
        enabled: hasSession,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });
    const bankrollCents = hasSession
        ? (summaryQuery.data?.availableCents ?? null)
        : null;
    const isBankrollPending = hasSession && summaryQuery.isPending;
    return (
        <>
            <ToolPageHeading toolId={ToolId.Compare} />
            <div className="app-prop-calculator__compare mb-10 flex flex-col gap-6">
                <InputsSummary />
                <ObjectiveChip
                    choiceNotes={compareChoiceNotes(choice, state.objective)}
                    objective={state.objective}
                    onChange={(objective) =>
                        dispatch({
                            objective,
                            type: CalculatorActionType.SetObjective,
                        })
                    }
                />
                <ToolSection
                    id={LegacySection.PlanComparison}
                    title="Plan comparison"
                >
                    <PlanComparisonTable
                        activePlan={state.plan}
                        bankrollCents={bankrollCents}
                        baseInputs={simInputs}
                        firm={state.firm}
                        isBankrollPending={isBankrollPending}
                        objective={state.objective}
                        planOptIns={planOptIns}
                    />
                </ToolSection>
                <ToolSection
                    id={LegacySection.FirmComparison}
                    title="Firm comparison"
                >
                    <FirmComparisonTable
                        activeFirmId={state.firm.id}
                        bankrollCents={bankrollCents}
                        baseInputs={simInputs}
                        firms={firms}
                        isBankrollPending={isBankrollPending}
                        objective={state.objective}
                        planOptIns={planOptIns}
                        targetAccountSize={state.plan.accountSize}
                    />
                </ToolSection>
                <CopySplitSection />
            </div>
        </>
    );
}

function compareChoiceNotes(
    choice: ObjectiveChoice,
    objective: SizingObjective,
): readonly string[] {
    if (objective !== SizingObjective.RuinFirst) {
        return objectiveChoiceNotes(choice, objective);
    }
    const failureNotes = objectiveChoiceNotes(
        { ...choice, automaticBasis: null },
        objective,
    );
    if (choice.automaticBasis === null) return failureNotes;
    const { availableCents, switchCents } = choice.automaticBasis;
    const threshold =
        switchCents === null
            ? 'objective threshold'
            : `${formatCurrency(switchCents / CENTS_PER_DOLLAR)} objective threshold`;
    return [
        `Chosen automatically: your available bankroll ${formatCurrency(availableCents / CENTS_PER_DOLLAR)} is below your ${threshold}, so this page ranks by ${SIZING_OBJECTIVE_LABEL[objective]}. Pick another objective here to override it.`,
        ...failureNotes,
    ];
}
