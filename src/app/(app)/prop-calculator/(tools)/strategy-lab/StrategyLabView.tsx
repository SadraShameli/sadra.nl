'use client';

import dynamic from 'next/dynamic';

import { EvalLadderScope } from '~/app/(app)/prop-calculator/_components/AppliedEvalLadderNotice';
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

const StrategyLabPanel = dynamic(
    () => import('~/app/(app)/prop-calculator/_components/StrategyLabPanel'),
    { loading: () => <PanelSkeleton /> },
);

export function StrategyLabView() {
    const { simInputs, state } = useCalculatorInputs();
    const actions = useCalculatorActions();
    return (
        <>
            <ToolPageHeading toolId={ToolId.StrategyLab} />
            <div className="app-prop-calculator__strategy-lab-page mb-10 flex flex-col gap-6">
                <InputsSummary evalLadderScope={EvalLadderScope.NotUsedHere} />
                <ToolSection
                    id={LegacySection.StrategyLab}
                    srOnlyHeading
                    title="Strategy lab"
                >
                    <StrategyLabPanel
                        activationDiscountPercent={
                            state.activationDiscountPercent
                        }
                        commissionPerRoundTrip={state.commissionPerRoundTrip}
                        evalDiscountPercent={state.evalDiscountPercent}
                        fundedHorizonDays={state.fundedHorizonDays}
                        labLink={state.labLink}
                        linkActivationDiscount={state.linkActivationDiscount}
                        liveTransferHazard={state.liveTransferHazard}
                        maxEvalDays={state.maxEvalDays}
                        minRetainedCushion={simInputs.minRetainedCushion}
                        monthlySubscriptionDiscountPercent={
                            state.monthlySubscriptionDiscountPercent
                        }
                        onAdd={actions.addLabScenario}
                        onRemove={actions.removeLabScenario}
                        onReset={actions.resetLabScenarios}
                        onUpdate={actions.updateLabScenario}
                        payoutRequestSize={simInputs.payoutRequestSize}
                        plan={simInputs.plan}
                        resetDiscountPercent={state.resetDiscountPercent}
                        rungSizing={simInputs.rungSizing}
                        scenarios={state.labScenarios}
                        seed={state.seed}
                    />
                </ToolSection>
            </div>
        </>
    );
}
