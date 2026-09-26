'use client';

import dynamic from 'next/dynamic';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

const PlanComparisonTable = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/PlanComparisonTable'),
    { loading: () => <PanelSkeleton /> },
);

const FirmComparisonTable = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/FirmComparisonTable'),
    { loading: () => <PanelSkeleton /> },
);

export function CompareView() {
    const { firms, planOptIns, simInputs, state } = useCalculatorInputs();
    return (
        <>
            <ToolPageHeading toolId={ToolId.Compare} />
            <div className="app-prop-calculator__compare mb-10 flex flex-col gap-6">
                <InputsSummary />
                <ToolSection
                    id={LegacySection.PlanComparison}
                    title="Plan comparison"
                >
                    <PlanComparisonTable
                        activePlan={state.plan}
                        baseInputs={simInputs}
                        firm={state.firm}
                        planOptIns={planOptIns}
                    />
                </ToolSection>
                <ToolSection
                    id={LegacySection.FirmComparison}
                    title="Firm comparison"
                >
                    <FirmComparisonTable
                        activeFirmId={state.firm.id}
                        baseInputs={simInputs}
                        firms={firms}
                        planOptIns={planOptIns}
                        targetAccountSize={state.plan.accountSize}
                    />
                </ToolSection>
            </div>
        </>
    );
}
