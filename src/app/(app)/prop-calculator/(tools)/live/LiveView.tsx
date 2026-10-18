'use client';

import { EvalLadderScope } from '~/app/(app)/prop-calculator/_components/AppliedEvalLadderNotice';
import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import {
    buildLiveToolModel,
    type LiveToolCalculatorInputs,
    liveToolModelCacheKey,
    LiveToolStatus,
} from '~/app/(app)/prop-calculator/_components/live/liveToolModel';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { useDebouncedComputation } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { useToolRulebook } from '~/app/(app)/prop-calculator/_components/useToolRulebook';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { formatCurrency, formatDays, formatPercent } from '~/lib/format';
import { type LiveOutputs, simulateLiveAccount } from '~/lib/prop-calculator';

const LIVE_DEBOUNCE_MS = 550;
const RESULT_HEADING_ID = 'live-result-heading';

export function LiveView() {
    const { state } = useCalculatorInputs();
    const { rulebook } = useToolRulebook();

    const modelInputs: LiveToolCalculatorInputs = {
        instrument: state.instrument,
        payoutRequestSize: state.payoutRequestSize,
        plan: state.plan,
        rrRatio: state.rrRatio,
        seed: state.seed,
        stopPoints: state.stopPoints,
        tradesPerDay: state.tradesPerDay,
        winrate: state.winrate,
    };
    const model = buildLiveToolModel(modelInputs, rulebook);
    const key =
        model.status === LiveToolStatus.Modeled
            ? liveToolModelCacheKey(modelInputs, rulebook)
            : model.status;
    const refusal =
        model.status === LiveToolStatus.Modeled ? null : model.message;

    const { error, pending, result } = useDebouncedComputation(
        ComputationId.Live,
        key,
        LIVE_DEBOUNCE_MS,
        () =>
            model.status === LiveToolStatus.Modeled
                ? simulateLiveAccount(model.simInputs)
                : null,
        null,
        refusal,
    );

    return (
        <>
            <ToolPageHeading toolId={ToolId.Live} />
            <div className="app-prop-calculator__live mb-10 flex flex-col gap-6">
                <InputsSummary evalLadderScope={EvalLadderScope.NotUsedHere} />
                <section aria-labelledby={RESULT_HEADING_ID}>
                    <ToolPanel
                        description={
                            model.status === LiveToolStatus.Modeled &&
                            model.note !== null
                                ? model.note
                                : undefined
                        }
                        title="Live stage results"
                        titleId={RESULT_HEADING_ID}
                    >
                        {model.status === LiveToolStatus.NotModeled ? (
                            <StatusRow
                                title={model.message}
                                tone={StatusTone.Neutral}
                            />
                        ) : (
                            <LiveComputationResult
                                error={error}
                                pending={pending}
                                result={result}
                            />
                        )}
                    </ToolPanel>
                </section>
            </div>
        </>
    );
}

function LiveComputationResult({
    error,
    pending,
    result,
}: {
    error: null | string;
    pending: boolean;
    result: LiveOutputs | null;
}) {
    if (error !== null) return <SimulationFailureNotice message={error} />;
    return result === null || pending ? (
        <PanelSkeleton />
    ) : (
        <LiveResultSummary out={result} />
    );
}

function LiveResultSummary({ out }: { out: LiveOutputs }) {
    return (
        <StatStrip
            items={[
                {
                    id: 'bust-probability',
                    label: 'Bust probability',
                    value: formatPercent(out.liveBustProbability),
                },
                {
                    id: 'inactivity-closure',
                    label: 'Closed for inactivity',
                    value: formatPercent(out.liveInactivityClosureProbability),
                },
                {
                    id: 'median-days-to-bust',
                    label: 'Median days to bust',
                    value: formatDays(out.medianDaysToBust),
                },
                {
                    id: 'median-days-to-first-withdrawal',
                    label: 'Median days to first withdrawal',
                    value: formatDays(out.medianDaysToFirstWithdrawal),
                },
                {
                    id: 'withdrawals-by-horizon',
                    label: 'Withdrawals by the horizon (median)',
                    value: formatCurrency(out.cumulativeWithdrawalsP50),
                },
                {
                    id: 'expected-annual-withdrawals',
                    label: 'Expected withdrawals per year',
                    value: formatCurrency(out.expectedAnnualWithdrawalRate),
                },
            ]}
        />
    );
}
