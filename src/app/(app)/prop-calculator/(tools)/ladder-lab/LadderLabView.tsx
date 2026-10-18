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

const LadderLabPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/LadderLabPanel'),
    { loading: () => <PanelSkeleton /> },
);

export function LadderLabView() {
    const { simInputs, state } = useCalculatorInputs();
    const { setEvalDayPolicy } = useCalculatorActions();
    return (
        <>
            <ToolPageHeading toolId={ToolId.LadderLab} />
            <div className="app-prop-calculator__ladder-lab-page mb-10 flex flex-col gap-6">
                <InputsSummary />
                <ToolSection
                    id={LegacySection.LadderLabSection}
                    srOnlyHeading
                    title="Ladder lab"
                >
                    <LadderLabPanel
                        activePolicy={state.evalDayPolicy}
                        baseInputs={simInputs}
                        onApply={setEvalDayPolicy}
                    />
                </ToolSection>
            </div>
        </>
    );
}
