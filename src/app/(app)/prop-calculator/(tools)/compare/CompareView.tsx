'use client';

import dynamic from 'next/dynamic';

import {
    useAvailableBankroll,
    useCalculatorActions,
    useCalculatorInputs,
    useObjectiveChoice,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { CalculatorActionType } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import {
    objectiveChoiceNotes,
    ObjectiveNotes,
    ObjectiveSelect,
} from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import {
    ScreenHourInputs,
    useScreenHourFilters,
} from '~/app/(app)/prop-calculator/_components/ScreenHourFilters';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { FilterToolbar } from '~/components/FilterToolbar';
import { Card } from '~/components/ui/card';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

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
    const { availableCents: bankrollCents, isPending: isBankrollPending } =
        useAvailableBankroll();
    const screenHourFilters = useScreenHourFilters();
    return (
        <>
            <ToolPageHeading toolId={ToolId.Compare} />
            <div className="app-prop-calculator__compare mb-10 flex flex-col gap-6">
                <InputsSummary />
                <Card className="app-prop-calculator__compare-toolbar gap-3 px-5 py-4">
                    <FilterToolbar label="Comparison ranking and filters">
                        <ObjectiveSelect
                            objective={state.objective}
                            onChange={(objective) =>
                                dispatch({
                                    objective,
                                    type: CalculatorActionType.SetObjective,
                                })
                            }
                        />
                        <ScreenHourInputs
                            idPrefix="comparison"
                            {...screenHourFilters}
                        />
                    </FilterToolbar>
                    <ObjectiveNotes
                        choiceNotes={objectiveChoiceNotes(
                            choice,
                            state.objective,
                            state.objective,
                        )}
                    />
                </Card>
                <ToolSection
                    description={`Plans within ${state.firm.displayName}`}
                    id={LegacySection.PlanComparison}
                    isPanel
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
                        screenHourFilters={screenHourFilters}
                    />
                </ToolSection>
                <ToolSection
                    id={LegacySection.FirmComparison}
                    isPanel
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
                        screenHourFilters={screenHourFilters}
                        targetAccountSize={state.plan.accountSize}
                    />
                </ToolSection>
                <CopySplitSection />
            </div>
        </>
    );
}
