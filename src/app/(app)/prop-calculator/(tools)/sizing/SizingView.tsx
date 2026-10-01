'use client';

import dynamic from 'next/dynamic';

import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { riskDollarsToPercent } from '~/app/(app)/prop-calculator/_components/riskConversion';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

const OptimalRiskTable = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/OptimalRiskTable'),
    { loading: () => <PanelSkeleton /> },
);

const SensitivityHeatmap = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/SensitivityHeatmap'),
    { loading: () => <PanelSkeleton /> },
);

const TakeProfitWhatIf = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/TakeProfitWhatIf'),
    { loading: () => <PanelSkeleton /> },
);

export function SizingView() {
    const { simInputs, state } = useCalculatorInputs();

    return (
        <>
            <ToolPageHeading toolId={ToolId.Sizing} />
            <div className="mb-10 flex flex-col gap-6">
                <InputsSummary />

                <ToolSection
                    id={LegacySection.OptimalRisk}
                    title="Optimal risk"
                >
                    <OptimalRiskTable
                        baseInputs={simInputs}
                        currentRiskPercent={
                            state.sizingMode === SizingMode.Percent
                                ? state.riskPercent
                                : riskDollarsToPercent(
                                      state.riskDollars,
                                      state.plan.accountSize,
                                  )
                        }
                        plan={state.plan}
                    />
                </ToolSection>

                <ToolSection id={LegacySection.Sensitivity} title="Sensitivity">
                    <SensitivityHeatmap
                        baseInputs={simInputs}
                        currentRR={state.rrRatio}
                        currentWinrate={state.winrate}
                    />
                </ToolSection>

                <TakeProfitWhatIf />
            </div>
        </>
    );
}
