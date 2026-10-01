'use client';

import { useCallback, useState } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { formatGateCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import { ECONOMICS_REASON_TEXT } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import { bankrollExplicitBatchRequest } from './bankrollModel';
import { parseBankrollPositiveIntField } from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

export function BatchCard() {
    const { variant } = useBankrollVariant();

    const [attempts, setAttempts] = useState<null | number>(null);
    const [attemptsText, setAttemptsText] = useState('');

    const requestKey = attempts === null ? null : stableJson({ attempts, variant });

    const buildRequest = useCallback(
        (runId: number) =>
            attempts === null ? null : bankrollExplicitBatchRequest(variant, attempts, runId),
        [attempts, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const result =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.Batch
            ? worker.state.result.result
            : null;
    const failureReason =
        attempts !== null && worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    return (
        <section aria-labelledby="bankroll-batch-heading" className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-white" id="bankroll-batch-heading">
                Batch
            </h2>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-batch-attempts">
                    Attempts (N)
                </label>
                <Input
                    id="bankroll-batch-attempts"
                    inputMode="numeric"
                    onChange={(event) => {
                        setAttemptsText(event.target.value);
                        setAttempts(parseBankrollPositiveIntField(event.target.value));
                    }}
                    placeholder="e.g. 40"
                    type="number"
                    value={attemptsText}
                />
            </div>
            {result === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">{failureReason}</p>
                )
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="EV (mean net)"
                        value={result.meanNet === null ? NOT_APPLICABLE : formatGateCurrency(result.meanNet)}
                    />
                    <StatCard
                        label="Funded value / attempt cost"
                        value={
                            result.fundedValueToAttemptCostRatio === null
                                ? NOT_APPLICABLE
                                : result.fundedValueToAttemptCostRatio.toFixed(2)
                        }
                    />
                    <StatCard
                        label="P(net < 0)"
                        sub="compound distribution"
                        value={
                            result.lossProbability === null
                                ? result.lossProbabilityReason === null
                                    ? NOT_APPLICABLE
                                    : ECONOMICS_REASON_TEXT[result.lossProbabilityReason]
                                : formatPercent(result.lossProbability)
                        }
                    />
                    <StatCard
                        label="One-value binomial cross-check"
                        sub="labelled cross-check, not the headline"
                        value={
                            result.crossCheckLossProbability === null
                                ? NOT_APPLICABLE
                                : formatPercent(result.crossCheckLossProbability)
                        }
                    />
                </div>
            )}
        </section>
    );
}
