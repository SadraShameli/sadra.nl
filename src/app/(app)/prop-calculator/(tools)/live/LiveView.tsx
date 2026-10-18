'use client';

import { Radio } from 'lucide-react';

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
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { useDebouncedComputation } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { useToolRulebook } from '~/app/(app)/prop-calculator/_components/useToolRulebook';
import { ValueOrMissing } from '~/app/(app)/prop-calculator/_components/ValueOrMissing';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCurrency, formatDays, formatPercent } from '~/lib/format';
import { type LiveOutputs, simulateLiveAccount } from '~/lib/prop-calculator';

const LIVE_DEBOUNCE_MS = 550;
const RESULT_HEADING_ID = 'live-result-heading';
const NO_LIVE_BUST_REASON = 'No simulated live account busted.';
const NO_LIVE_WITHDRAWAL_REASON = 'No simulated live account withdrew.';

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
                        isComputing={
                            model.status === LiveToolStatus.Modeled && pending
                        }
                        title="Live stage results"
                        titleId={RESULT_HEADING_ID}
                    >
                        {model.status === LiveToolStatus.NotModeled ? (
                            <EmptyState
                                description={model.reason}
                                icon={Radio}
                                size={EmptyStateSize.Compact}
                                title="No live stage modeled"
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
    return (
        <LiveResultSummary out={result === null || pending ? null : result} />
    );
}

function LiveResultSummary({ out }: { out: LiveOutputs | null }) {
    return (
        <StatStrip
            isLoading={out === null}
            items={[
                {
                    id: 'bust-probability',
                    label: 'Bust probability',
                    value:
                        out === null
                            ? null
                            : formatPercent(out.liveBustProbability),
                },
                {
                    id: 'inactivity-closure',
                    label: 'Closed for inactivity',
                    value:
                        out === null
                            ? null
                            : formatPercent(
                                  out.liveInactivityClosureProbability,
                              ),
                },
                {
                    id: 'median-days-to-bust',
                    label: 'Median days to bust',
                    value:
                        out === null ? null : (
                            <ValueOrMissing
                                reason={NO_LIVE_BUST_REASON}
                                value={formatDays(out.medianDaysToBust)}
                            />
                        ),
                },
                {
                    id: 'median-days-to-first-withdrawal',
                    label: 'Median days to first withdrawal',
                    value:
                        out === null ? null : (
                            <ValueOrMissing
                                reason={NO_LIVE_WITHDRAWAL_REASON}
                                value={formatDays(
                                    out.medianDaysToFirstWithdrawal,
                                )}
                            />
                        ),
                },
                {
                    id: 'withdrawals-by-horizon',
                    label: 'Withdrawals by the horizon (median)',
                    value:
                        out === null
                            ? null
                            : formatCurrency(out.cumulativeWithdrawalsP50),
                },
                {
                    id: 'expected-annual-withdrawals',
                    label: 'Expected withdrawals per year',
                    value:
                        out === null
                            ? null
                            : formatCurrency(out.expectedAnnualWithdrawalRate),
                },
            ]}
        />
    );
}
