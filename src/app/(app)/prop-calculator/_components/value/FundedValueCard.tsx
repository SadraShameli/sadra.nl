'use client';

import { useMemo, useState } from 'react';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { formatPercent, NOT_APPLICABLE } from '~/lib/format';
import { stableJson } from '~/lib/stableJson';

import {
    fundedValueEstimateToolsRequest,
    fundedValueSampleSize,
    isInvalidSampleSizeField,
    parseFundedValueSampleSizeField,
    sampleRangeSubText,
    sampleRangeText,
    toolsWorkerFailureReason,
    toolsWorkerPendingText,
    uncertainCountText,
    type ValueCardsInput,
    ValueCardsInputKind,
} from './valueCardsModel';

const SAMPLE_SIZE_ERROR_ID = 'funded-value-sample-size-error';
const SAMPLE_SIZE_ERROR_TEXT = 'Enter a whole number of accounts, 1 or more.';

export function FundedValueCard({
    cards,
    rulebookSampleThreshold,
}: {
    cards: ValueCardsInput;
    rulebookSampleThreshold: null | number;
}) {
    const [sampleSizeText, setSampleSizeText] = useState('');
    const isSampleSizeInvalid = isInvalidSampleSizeField(sampleSizeText);
    const sampleSize = fundedValueSampleSize(
        rulebookSampleThreshold,
        parseFundedValueSampleSizeField(sampleSizeText),
    );

    const inputs = useMemo(() => ({ cards, sampleSize }), [cards, sampleSize]);
    const settled = useDebouncedValue(inputs, SIM_DEBOUNCE_MS);
    const settledCards =
        settled.cards.kind === ValueCardsInputKind.Ready ? settled.cards.cards : null;
    const worker = useToolsRequest(
        settledCards === null || isSampleSizeInvalid
            ? null
            : stableJson({ cards: settledCards, sampleSize: settled.sampleSize }),
        (runId) =>
            settledCards === null
                ? null
                : fundedValueEstimateToolsRequest(settledCards, settled.sampleSize, runId),
    );

    const refusal = cards.kind === ValueCardsInputKind.Refused ? cards.reason : null;
    const shouldShowWorkerOutput = refusal === null && !isSampleSizeInvalid;
    const result =
        shouldShowWorkerOutput &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.FundedValueEstimate
            ? worker.state.result.result
            : null;
    const failureReason =
        refusal ?? (shouldShowWorkerOutput ? toolsWorkerFailureReason(worker.state) : null);
    const pendingText = shouldShowWorkerOutput ? toolsWorkerPendingText(worker.state) : null;

    return (
        <section
            aria-busy={shouldShowWorkerOutput && worker.state.phase === ToolsWorkerPhase.Running}
            aria-labelledby="funded-value-heading"
            className="flex flex-col gap-4"
        >
            <h3 className="text-base font-semibold text-white" id="funded-value-heading">
                Funded value
            </h3>
            <div className="flex flex-col gap-1">
                <Label htmlFor="funded-value-sample-size">Sample size (n)</Label>
                <Input
                    aria-describedby={isSampleSizeInvalid ? SAMPLE_SIZE_ERROR_ID : undefined}
                    aria-invalid={isSampleSizeInvalid}
                    id="funded-value-sample-size"
                    inputMode="numeric"
                    onChange={(event) => {
                        setSampleSizeText(event.target.value);
                    }}
                    placeholder={
                        rulebookSampleThreshold === null
                            ? 'e.g. 10'
                            : String(rulebookSampleThreshold)
                    }
                    type="number"
                    value={sampleSizeText}
                />
                {isSampleSizeInvalid ? (
                    <p className="text-xs text-rose-400" id={SAMPLE_SIZE_ERROR_ID}>
                        {SAMPLE_SIZE_ERROR_TEXT}
                    </p>
                ) : null}
            </div>
            <div aria-live="polite" className="flex flex-col gap-3">
                {failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )}
                {pendingText === null ? null : (
                    <p className="text-xs text-muted-foreground">{pendingText}</p>
                )}
                {result === null ? null : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <StatCard
                            label="Mean payouts per funded account"
                            sub={`${String(result.trials)} trials`}
                            value={uncertainCountText(result.meanPayoutsPerAccount)}
                        />
                        <StatCard
                            label="P(0 payouts)"
                            value={formatPercent(result.probabilityZeroPayouts.value)}
                        />
                        <StatCard
                            label="Range n accounts could show"
                            sub={sampleRangeSubText(result.sampleRange)}
                            value={sampleRangeText(result.sampleRange) ?? NOT_APPLICABLE}
                        />
                    </div>
                )}
            </div>
        </section>
    );
}
