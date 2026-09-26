'use client';

import dynamic from 'next/dynamic';

import {
    useBaseResult,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

const StrategyAnalysis = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/StrategyAnalysis'),
    { loading: () => <PanelSkeleton /> },
);

const TailRiskPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/TailRiskPanel'),
    { loading: () => <PanelSkeleton /> },
);

const DrawdownDurationPanel = dynamic(
    () =>
        import('~/app/(app)/prop-calculator/_components/DrawdownDurationPanel'),
    { loading: () => <PanelSkeleton /> },
);

const ResiliencePanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/ResiliencePanel'),
    { loading: () => <PanelSkeleton /> },
);

const RuleStressTestPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/RuleStressTestPanel'),
    { loading: () => <PanelSkeleton /> },
);

export function AnalysisView() {
    const { simInputs } = useCalculatorInputs();
    const { isPending, result } = useBaseResult();
    const refusal = simInputsSizingIssue(simInputs);
    const refusalNotice =
        refusal === null ? null : <SimulationFailureNotice message={refusal} />;

    return (
        <>
            <ToolPageHeading toolId={ToolId.Analysis} />
            <div className="mb-10 flex flex-col gap-6">
                <InputsSummary />

                <ToolSection id={LegacySection.Strategy} title="Strategy">
                    {refusalNotice ??
                        (result === null || isPending ? (
                            <PanelSkeleton />
                        ) : (
                            <StrategyAnalysis
                                baseInputs={simInputs}
                                result={result}
                            />
                        ))}
                </ToolSection>

                <ToolSection id={LegacySection.TailRisk} title="Tail risk">
                    {refusalNotice ??
                        (result === null || isPending ? (
                            <PanelSkeleton />
                        ) : (
                            <TailRiskPanel result={result} />
                        ))}
                </ToolSection>

                <ToolSection
                    id={LegacySection.Drawdown}
                    title="Drawdown duration"
                >
                    {refusalNotice ??
                        (result === null || isPending ? (
                            <PanelSkeleton />
                        ) : (
                            <DrawdownDurationPanel result={result} />
                        ))}
                </ToolSection>

                <ToolSection id={LegacySection.Resilience} title="Resilience">
                    {refusalNotice ??
                        (result === null || isPending ? (
                            <PanelSkeleton />
                        ) : (
                            <ResiliencePanel
                                baseInputs={simInputs}
                                result={result}
                            />
                        ))}
                </ToolSection>

                <ToolSection
                    id={LegacySection.RuleStressTest}
                    title="Rule stress test"
                >
                    <RuleStressTestPanel baseInputs={simInputs} />
                </ToolSection>
            </div>
        </>
    );
}
