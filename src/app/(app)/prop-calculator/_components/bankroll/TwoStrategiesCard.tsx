'use client';

import { useCallback, useState } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { formatGateCurrency, NOT_APPLICABLE } from '~/lib/format';
import { type Dollars, fraction, type Fraction0to1 } from '~/lib/prop-calculator';
import { BankrollLeverLabel } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import {
    BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL,
    bankrollClosedFormIllustration,
    type BankrollProjectionSummary,
    bankrollTwoStrategiesRequest,
    bankrollTwoStrategiesSummary,
    bankrollVariantWithRisk,
} from './bankrollModel';
import {
    parseBankrollDollarsField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

const RISK_B_CONFLICT_MESSAGE_ID = 'bankroll-two-strategies-risk-b-conflict';

export function TwoStrategiesCard() {
    const { variant: variantA } = useBankrollVariant();

    const [riskB, setRiskB] = useState<Dollars | null>(null);
    const [start, setStart] = useState<Dollars | null>(null);
    const [horizonDays, setHorizonDays] = useState<null | number>(null);
    const [reinvestFraction, setReinvestFraction] = useState<Fraction0to1 | null>(null);

    const variantB = riskB === null ? null : bankrollVariantWithRisk(variantA, riskB);

    const canRun = variantB !== null && start !== null && horizonDays !== null;
    const requestKey = canRun
        ? stableJson({ horizonDays, reinvestFraction, start, variantA, variantB })
        : null;

    const buildRequest = useCallback(
        (runId: number) =>
            variantB === null || start === null || horizonDays === null
                ? null
                : bankrollTwoStrategiesRequest(
                      [variantA, variantB],
                      {
                          capacity: null,
                          horizonDays,
                          monthlyBudget: null,
                          payoutLagDays: 0,
                          reinvestFraction: reinvestFraction ?? fraction(0),
                          start,
                      },
                      runId,
                  ),
        [horizonDays, reinvestFraction, start, variantA, variantB],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const results =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.TwoStrategies
            ? worker.state.result.results
            : null;
    const summaries = results === null ? null : bankrollTwoStrategiesSummary(results);
    const failureReason =
        canRun && worker.state.phase === ToolsWorkerPhase.Failed ? worker.state.reason : null;

    const illustration =
        start === null || horizonDays === null
            ? null
            : bankrollClosedFormIllustration(start, reinvestFraction ?? fraction(0), horizonDays);

    return (
        <section aria-labelledby="bankroll-two-strategies-heading" className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-white" id="bankroll-two-strategies-heading">
                Two strategies
            </h2>
            <p className="text-xs text-muted-foreground">
                Compares strategy A (your current risk) against strategy B (an
                alternate risk), on the same seed and the same bankroll policy.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                    id="bankroll-two-strategies-start"
                    label="Starting bankroll ($)"
                    onChange={(raw) => setStart(parseBankrollDollarsField(raw))}
                />
                <NumberField
                    id="bankroll-two-strategies-horizon"
                    label="Horizon (trading days)"
                    onChange={(raw) => setHorizonDays(parseBankrollPositiveIntField(raw))}
                />
                <NumberField
                    id="bankroll-two-strategies-reinvest"
                    label="Reinvest fraction (0 to 1)"
                    onChange={(raw) => setReinvestFraction(parseBankrollReinvestFractionField(raw))}
                />
                <NumberField
                    describedBy={riskB === null ? undefined : RISK_B_CONFLICT_MESSAGE_ID}
                    id="bankroll-two-strategies-risk-b"
                    label="Strategy B risk per trade ($)"
                    onChange={(raw) => setRiskB(parseBankrollDollarsField(raw))}
                />
            </div>
            {riskB === null ? null : (
                <p className="text-xs text-amber-400" id={RISK_B_CONFLICT_MESSAGE_ID}>
                    Strategy B: {BankrollLeverLabel.ConflictsWithHardRule3}
                </p>
            )}
            {summaries === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">{failureReason}</p>
                )
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <StrategySummaryColumn label="A" summary={summaries[0]} />
                    <StrategySummaryColumn label="B" summary={summaries[1]} />
                </div>
            )}
            {illustration === null ? null : (
                <p className="text-xs text-muted-foreground">
                    {BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL} (shared by both
                    strategies):{' '}
                    {illustration.value === null
                        ? NOT_APPLICABLE
                        : formatGateCurrency(illustration.value)}
                </p>
            )}
        </section>
    );
}

function NumberField({
    describedBy,
    id,
    label,
    onChange,
}: {
    describedBy?: string;
    id: string;
    label: string;
    onChange: (raw: string) => void;
}) {
    const [text, setText] = useState('');
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
                {label}
            </label>
            <Input
                aria-describedby={describedBy}
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                    setText(event.target.value);
                    onChange(event.target.value);
                }}
                placeholder="Not set"
                type="number"
                value={text}
            />
        </div>
    );
}

function StrategySummaryColumn({
    label,
    summary,
}: {
    label: string;
    summary: BankrollProjectionSummary;
}) {
    return (
        <div className="grid gap-3">
            <p className="text-xs font-medium text-muted-foreground">Strategy {label}</p>
            <StatCard
                label="Final bankroll (P10 / P50 / P90)"
                value={`${formatGateCurrency(summary.finalCashP10)} / ${formatGateCurrency(summary.finalCashP50)} / ${formatGateCurrency(summary.finalCashP90)}`}
            />
            <StatCard
                label="Multiple (P50 cash / start)"
                value={summary.multiple === null ? NOT_APPLICABLE : `${summary.multiple.toFixed(2)}x`}
            />
            <StatCard
                label="Measured cycle days"
                value={summary.measuredCycleDays === null ? NOT_APPLICABLE : summary.measuredCycleDays.toFixed(1)}
            />
        </div>
    );
}
