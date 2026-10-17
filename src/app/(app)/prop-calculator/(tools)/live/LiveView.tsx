'use client';

import { ToolSectionHeading } from '~/app/(app)/_components/ToolSectionHeading';
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
import { Alert, AlertDescription } from '~/components/ui/Alert';
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
                <section
                    aria-labelledby={RESULT_HEADING_ID}
                    className="flex flex-col gap-4"
                >
                    <ToolSectionHeading id={RESULT_HEADING_ID}>
                        Live stage results
                    </ToolSectionHeading>
                    {model.status === LiveToolStatus.Modeled &&
                        model.note !== null && (
                            <p className="text-xs text-muted-foreground">
                                {model.note}
                            </p>
                        )}
                    {model.status === LiveToolStatus.NotModeled ? (
                        <Alert>
                            <AlertDescription>{model.message}</AlertDescription>
                        </Alert>
                    ) : (
                        <LiveComputationResult
                            error={error}
                            pending={pending}
                            result={result}
                        />
                    )}
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
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <LiveStat
                label="Bust probability"
                value={formatPercent(out.liveBustProbability)}
            />
            <LiveStat
                label="Closed for inactivity"
                value={formatPercent(out.liveInactivityClosureProbability)}
            />
            <LiveStat
                label="Median days to bust"
                value={formatDays(out.medianDaysToBust)}
            />
            <LiveStat
                label="Median days to first withdrawal"
                value={formatDays(out.medianDaysToFirstWithdrawal)}
            />
            <LiveStat
                label="Withdrawals by the horizon (median)"
                value={formatCurrency(out.cumulativeWithdrawalsP50)}
            />
            <LiveStat
                label="Expected withdrawals per year"
                value={formatCurrency(out.expectedAnnualWithdrawalRate)}
            />
        </dl>
    );
}

function LiveStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground tabular-nums">
                {value}
            </dd>
        </div>
    );
}
