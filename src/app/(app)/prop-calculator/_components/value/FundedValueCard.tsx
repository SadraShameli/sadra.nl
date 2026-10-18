'use client';

import { useMemo, useState } from 'react';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { InfoNote } from '~/components/InfoNote';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    assumptionText,
    liveTransferAssumptionLines,
} from '~/lib/prop-calculator/advisor';
import { type FundedValueEstimateResult } from '~/lib/prop-calculator/advisor/value';
import { stableJson } from '~/lib/stableJson';

import {
    dollarRangeSubText,
    dollarRangeText,
    fundedValueEstimateToolsRequest,
    fundedValueSampleSize,
    isInvalidSampleSizeField,
    parseFundedValueSampleSizeField,
    sampleRangeSubText,
    sampleRangeText,
    toolsWorkerFailureReason,
    toolsWorkerPendingText,
    uncertainCountText,
    uncertainCurrencyText,
    type ValueCardsInput,
    ValueCardsInputKind,
} from './valueCardsModel';

const SAMPLE_SIZE_ERROR_ID = 'funded-value-sample-size-error';
const SAMPLE_SIZE_ERROR_TEXT = 'Enter a whole number of accounts, 1 or more.';
const REFUSED_TEXT =
    'Not computed while the value inputs are refused; the reason is shown in the value chain card.';

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
        settled.cards.kind === ValueCardsInputKind.Ready
            ? settled.cards.cards
            : null;
    const worker = useToolsRequest(
        settledCards === null || isSampleSizeInvalid
            ? null
            : stableJson({
                  cards: settledCards,
                  sampleSize: settled.sampleSize,
              }),
        (runId) =>
            settledCards === null
                ? null
                : fundedValueEstimateToolsRequest(
                      settledCards,
                      settled.sampleSize,
                      runId,
                  ),
    );

    const isRefused = cards.kind === ValueCardsInputKind.Refused;
    const shouldShowWorkerOutput = !isRefused && !isSampleSizeInvalid;
    const result =
        shouldShowWorkerOutput &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.FundedValueEstimate
            ? worker.state.result.result
            : null;
    const failureReason = shouldShowWorkerOutput
        ? toolsWorkerFailureReason(worker.state)
        : null;
    const pendingText = shouldShowWorkerOutput
        ? toolsWorkerPendingText(worker.state)
        : null;

    return (
        <section
            aria-busy={
                shouldShowWorkerOutput &&
                worker.state.phase === ToolsWorkerPhase.Running
            }
            aria-labelledby="funded-value-heading"
        >
            <ToolPanel
                info={
                    result === null ||
                    (result.liveTransfer === undefined &&
                        result.cumulativePayoutTrigger ===
                            undefined) ? undefined : (
                        <FundedValueAssumptions result={result} />
                    )
                }
                title="Funded value"
                titleAs="h3"
                titleId="funded-value-heading"
            >
                <div className="flex flex-col gap-1">
                    <Label htmlFor="funded-value-sample-size">
                        Sample size (n)
                    </Label>
                    <Input
                        aria-describedby={
                            isSampleSizeInvalid
                                ? SAMPLE_SIZE_ERROR_ID
                                : undefined
                        }
                        aria-invalid={isSampleSizeInvalid}
                        className="max-w-40"
                        disabled={isRefused}
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
                    {isRefused ? (
                        <p className="text-xs text-muted-foreground">
                            {REFUSED_TEXT}
                        </p>
                    ) : null}
                    {isSampleSizeInvalid ? (
                        <p
                            className="text-xs text-destructive"
                            id={SAMPLE_SIZE_ERROR_ID}
                        >
                            {SAMPLE_SIZE_ERROR_TEXT}
                        </p>
                    ) : null}
                </div>
                <div aria-live="polite" className="flex flex-col gap-3">
                    {failureReason === null ? null : (
                        <Alert variant="destructive">
                            <AlertDescription>{failureReason}</AlertDescription>
                        </Alert>
                    )}
                    {pendingText === null ? null : (
                        <InfoNote>{pendingText}</InfoNote>
                    )}
                    {result === null ? null : (
                        <StatStrip
                            items={[
                                {
                                    caption: `${String(result.trials)} trials`,
                                    id: 'expected-payout',
                                    label: 'Expected payout per funded account',
                                    value: uncertainCurrencyText(
                                        result.fundedValue,
                                    ),
                                },
                                {
                                    caption: dollarRangeSubText(
                                        result.dollarSampleRange,
                                        settled.sampleSize,
                                    ),
                                    id: 'dollar-range',
                                    label: 'Range n accounts could show ($)',
                                    value:
                                        dollarRangeText(
                                            result.dollarSampleRange,
                                        ) ?? NOT_APPLICABLE,
                                },
                                {
                                    caption: `${String(result.trials)} trials`,
                                    id: 'mean-payouts',
                                    label: 'Mean payouts per funded account',
                                    value: uncertainCountText(
                                        result.meanPayoutsPerAccount,
                                    ),
                                },
                                {
                                    id: 'zero-payouts',
                                    label: 'P(0 payouts)',
                                    value: formatPercent(
                                        result.probabilityZeroPayouts.value,
                                    ),
                                },
                                {
                                    caption: sampleRangeSubText(
                                        result.sampleRange,
                                    ),
                                    id: 'payout-range',
                                    label: 'Range n accounts could show (payouts)',
                                    value:
                                        sampleRangeText(result.sampleRange) ??
                                        NOT_APPLICABLE,
                                },
                            ]}
                        />
                    )}
                </div>
            </ToolPanel>
        </section>
    );
}

function FundedValueAssumptions({
    result,
}: {
    result: Pick<
        FundedValueEstimateResult,
        'cumulativePayoutTrigger' | 'liveTransfer'
    >;
}) {
    return (
        <div className="flex flex-col gap-2">
            {result.liveTransfer === undefined ? null : (
                <ul
                    aria-label="Live-transfer and payout-trigger assumptions behind the funded value"
                    className="flex flex-col gap-1"
                >
                    {liveTransferAssumptionLines(result.liveTransfer).map(
                        (line) => (
                            <li key={line}>{line}</li>
                        ),
                    )}
                </ul>
            )}
            {result.cumulativePayoutTrigger === undefined ? null : (
                <ul
                    aria-label="Cumulative payout trigger behind the funded value"
                    className="flex flex-col gap-1"
                >
                    <li>{assumptionText(result.cumulativePayoutTrigger)}</li>
                </ul>
            )}
        </div>
    );
}
