'use client';

import { useCallback, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { StatStrip } from '~/components/StatStrip';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { ECONOMICS_REASON_TEXT } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import { bankrollExplicitBatchRequest } from './bankrollModel';
import { BankrollRunStatus } from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { parseBankrollPositiveIntField } from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

export function BatchCard() {
    const { variant } = useBankrollVariant();

    const [attempts, setAttempts] = useState<null | number>(null);
    const [attemptsText, setAttemptsText] = useState('');

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
            description="Prices a fixed number of attempts: the expected net and the chance the whole batch loses money."
            headingId="bankroll-batch-heading"
            title="Batch"
        >
            <Field>
                <FieldLabel htmlFor="bankroll-batch-attempts">
                    Attempts (N)
                </FieldLabel>
                <Input
                    id="bankroll-batch-attempts"
                    inputMode="numeric"
                    onChange={(event) => {
                        setAttemptsText(event.target.value);
                        setAttempts(
                            parseBankrollPositiveIntField(event.target.value),
                        );
                    }}
                    placeholder="e.g. 40"
                    type="number"
                    value={attemptsText}
                />
            </Field>
            {result === null ? (
                <BankrollRunStatus
                    isRequested={attempts !== null}
                    state={worker.state}
                />
            ) : (
                <StatStrip
                    items={[
                        {
                            id: 'mean-net',
                            label: 'EV (mean net)',
                            value:
                                result.meanNet === null
                                    ? NOT_APPLICABLE
                                    : formatGateCurrency(result.meanNet),
                        },
                        {
                            id: 'funded-value-ratio',
                            label: 'Funded value / attempt cost',
                            value:
                                result.fundedValueToAttemptCostRatio === null
                                    ? NOT_APPLICABLE
                                    : result.fundedValueToAttemptCostRatio.toFixed(
                                          2,
                                      ),
                        },
                        {
                            caption: 'compound distribution',
                            id: 'loss-probability',
                            label: 'P(net < 0)',
                            value:
                                result.lossProbability === null
                                    ? result.lossProbabilityReason === null
                                        ? NOT_APPLICABLE
                                        : ECONOMICS_REASON_TEXT[
                                              result.lossProbabilityReason
                                          ]
                                    : formatPercent(result.lossProbability),
                        },
                        {
                            caption: 'labelled cross-check, not the headline',
                            id: 'cross-check',
                            label: 'One-value binomial cross-check',
                            value:
                                result.crossCheckLossProbability === null
                                    ? NOT_APPLICABLE
                                    : formatPercent(
                                          result.crossCheckLossProbability,
                                      ),
                        },
                    ]}
                />
            )}
        </BankrollSection>
    );
}
