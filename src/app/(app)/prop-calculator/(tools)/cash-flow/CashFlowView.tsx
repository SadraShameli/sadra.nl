'use client';

import dynamic from 'next/dynamic';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

const CashFlowPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/CashFlowPanel'),
    { loading: () => <PanelSkeleton /> },
);

export function CashFlowView() {
    const { simInputs, state } = useCalculatorInputs();
    return (
        <>
            <ToolPageHeading toolId={ToolId.CashFlow} />
            <div className="app-prop-calculator__cash-flow mb-10 flex flex-col gap-6">
                <InputsSummary />
                <ToolSection
                    id={LegacySection.CashFlow}
                    srOnlyHeading
                    title="Cash flow"
                >
                    <CashFlowPanel
                        baseInputs={simInputs}
                        firmDisplayName={state.firm.displayName}
                        maxAccounts={state.firm.maxFundedAccounts(state.plan)}
                    />
                </ToolSection>
            </div>
        </>
    );
}
