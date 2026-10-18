'use client';

import dynamic from 'next/dynamic';

import {
    useCalculatorActions,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

const PortfolioPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/PortfolioPanel'),
    { loading: () => <PanelSkeleton /> },
);

export function PlannerView() {
    const { firms, planOptIns, simInputs, state } = useCalculatorInputs();
    const { setPortfolio } = useCalculatorActions();
    return (
        <>
            <ToolPageHeading toolId={ToolId.Planner} />
            <div className="app-prop-calculator__planner mb-10 flex flex-col gap-6">
                <InputsSummary />
                <ToolSection
                    id={LegacySection.Portfolio}
                    srOnlyHeading
                    title="Multi-firm planner"
                >
                    <PortfolioPanel
                        baseInputs={simInputs}
                        currentFirm={state.firm}
                        currentPlan={state.plan}
                        firms={firms}
                        onPortfolioChange={setPortfolio}
                        planOptIns={planOptIns}
                        portfolio={state.portfolio}
                    />
                </ToolSection>
            </div>
        </>
    );
}
