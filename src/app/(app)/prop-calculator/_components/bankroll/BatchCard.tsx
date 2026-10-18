'use client';

import { useCallback, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    type BatchToolsSummary,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { MissingValue } from '~/components/MissingValue';
import { StatStrip, type StatStripItem } from '~/components/StatStrip';
import { formatPercent, formatWholeOrCentsCurrency } from '~/lib/format';
import { ECONOMICS_REASON_TEXT } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import { BankrollField, BankrollFieldKind } from './BankrollField';
import { bankrollExplicitBatchRequest } from './bankrollModel';
import {
    BankrollRunStatus,
    isAwaitingRequestedResult,
} from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { readyValue } from './bankrollStatItems';
import { parseBankrollPositiveIntField } from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

export function BatchCard() {
    const { variant } = useBankrollVariant();

    const [attempts, setAttempts] = useState<null | number>(null);

    const requestKey =
        attempts === null ? null : stableJson({ attempts, variant });

    const buildRequest = useCallback(
        (runId: number) =>
            attempts === null
                ? null
                : bankrollExplicitBatchRequest(variant, attempts, runId),
        [attempts, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const result =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.Batch
            ? worker.state.result.result
            : null;

    return (
        <BankrollSection
            headingId="bankroll-batch-heading"
            info="Prices a fixed number of attempts: the expected net and the chance the whole batch loses money."
            inputs={
                <BankrollField
                    id="bankroll-batch-attempts"
                    info="How many attempts the batch buys, as a whole number."
                    kind={BankrollFieldKind.Integer}
                    label="Attempts"
                    onChange={(raw) =>
                        setAttempts(parseBankrollPositiveIntField(raw))
                    }
                    placeholder="e.g. 40"
                />
            }
            isComputing={isAwaitingRequestedResult(
                attempts !== null,
                worker.state,
            )}
            results={
                result === null ? (
                    <BankrollRunStatus
                        emptyText="Enter a number of attempts to price the batch."
                        isRequested={attempts !== null}
                        skeleton={
                            <StatStrip isLoading items={batchItems(null)} />
                        }
                        state={worker.state}
                    />
                ) : (
                    <StatStrip items={batchItems(result)} />
                )
            }
            title="Batch"
        />
    );
}

function batchItems(
    result: BatchToolsSummary | null,
): readonly StatStripItem[] {
    return [
        {
            id: 'mean-net',
            label: 'EV (mean net)',
            value: readyValue(result, (ready) =>
                ready.meanNet === null ? (
                    <MissingValue />
                ) : (
                    formatWholeOrCentsCurrency(ready.meanNet)
                ),
            ),
        },
        {
            id: 'funded-value-ratio',
            label: 'Funded value / attempt cost',
            value: readyValue(result, (ready) =>
                ready.fundedValueToAttemptCostRatio === null ? (
                    <MissingValue />
                ) : (
                    ready.fundedValueToAttemptCostRatio.toFixed(2)
                ),
            ),
        },
        {
            caption: 'compound distribution',
            id: 'loss-probability',
            label: 'P(net < 0)',
            value: readyValue(result, (ready) =>
                ready.lossProbability === null ? (
                    ready.lossProbabilityReason === null ? (
                        <MissingValue />
                    ) : (
                        ECONOMICS_REASON_TEXT[ready.lossProbabilityReason]
                    )
                ) : (
                    formatPercent(ready.lossProbability)
                ),
            ),
        },
        {
            caption: 'labelled cross-check, not the headline',
            id: 'cross-check',
            label: 'One-value binomial cross-check',
            value: readyValue(result, (ready) =>
                ready.crossCheckLossProbability === null ? (
                    <MissingValue />
                ) : (
                    formatPercent(ready.crossCheckLossProbability)
                ),
            ),
        },
    ];
}
