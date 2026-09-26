'use client';

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
import { useSession } from '~/lib/auth/client';
import { formatCurrency, formatDays, formatPercent } from '~/lib/format';
import { type LiveOutputs, simulateLiveAccount } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { api } from '~/trpc/react';

const LIVE_DEBOUNCE_MS = 550;
const RESULT_HEADING_ID = 'live-result-heading';

export function LiveView() {
    const { state } = useCalculatorInputs();
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const rulebook =
        hasSession && rulebookQuery.data !== undefined
            ? rulebookQuery.data
            : DEFAULT_RULEBOOK;

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
                <InputsSummary />
                <section
                    aria-labelledby={RESULT_HEADING_ID}
                    className="flex flex-col gap-4"
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={RESULT_HEADING_ID}
                    >
                        Live account
                    </h2>
                    {model.status === LiveToolStatus.Modeled &&
                        model.note !== null && (
                            <p className="text-xs text-muted-foreground">
                                {model.note}
                            </p>
                        )}
                    {model.status === LiveToolStatus.NotModeled ? (
                        <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
                            {model.message}
                        </p>
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
                label="bust probability"
                value={formatPercent(out.liveBustProbability)}
            />
            <LiveStat
                label="inactivity closure probability"
                value={formatPercent(out.liveInactivityClosureProbability)}
            />
            <LiveStat
                label="median days to bust"
                value={formatDays(out.medianDaysToBust)}
            />
            <LiveStat
                label="median days to 1st withdrawal"
                value={formatDays(out.medianDaysToFirstWithdrawal)}
            />
            <LiveStat
                label="withdrawals at horizon (p50)"
                value={formatCurrency(out.cumulativeWithdrawalsP50)}
            />
            <LiveStat
                label="expected annual withdrawal rate"
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
