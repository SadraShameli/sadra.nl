'use client';

import { useCallback, useState } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Field, FieldLabel } from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';
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
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="EV (mean net)"
                        value={
                            result.meanNet === null
                                ? NOT_APPLICABLE
                                : formatGateCurrency(result.meanNet)
                        }
                    />
                    <StatCard
                        label="Funded value / attempt cost"
                        value={
                            result.fundedValueToAttemptCostRatio === null
                                ? NOT_APPLICABLE
                                : result.fundedValueToAttemptCostRatio.toFixed(
                                      2,
                                  )
                        }
                    />
                    <StatCard
                        label="P(net < 0)"
                        sub="compound distribution"
                        value={
                            result.lossProbability === null
                                ? result.lossProbabilityReason === null
                                    ? NOT_APPLICABLE
                                    : ECONOMICS_REASON_TEXT[
                                          result.lossProbabilityReason
                                      ]
                                : formatPercent(result.lossProbability)
                        }
                    />
                    <StatCard
                        label="One-value binomial cross-check"
                        sub="labelled cross-check, not the headline"
                        value={
                            result.crossCheckLossProbability === null
                                ? NOT_APPLICABLE
                                : formatPercent(
                                      result.crossCheckLossProbability,
                                  )
                        }
                    />
                </div>
            )}
        </BankrollSection>
    );
}
