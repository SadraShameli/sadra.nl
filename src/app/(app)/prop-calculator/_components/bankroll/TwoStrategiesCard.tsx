'use client';

import { useCallback, useState } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { formatGateCurrency, NOT_APPLICABLE } from '~/lib/format';
import {
    type Dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator';
import { BankrollLeverLabel } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import {
    BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL,
    bankrollCycleDescription,
    bankrollCycleFigures,
    bankrollCycleInput,
    type BankrollProjectionSummary,
    bankrollTwoStrategiesRequest,
    bankrollTwoStrategiesSummary,
    bankrollVariantWithRisk,
} from './bankrollModel';
import {
    type BankrollUrlState,
    parseBankrollDollarsField,
    parseBankrollMultipleField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

const RISK_B_CONFLICT_MESSAGE_ID = 'bankroll-two-strategies-risk-b-conflict';

interface TwoStrategiesCardProperties {
    onChange: (patch: Partial<BankrollUrlState>) => void;
    state: BankrollUrlState;
}

export function TwoStrategiesCard({
    onChange,
    state,
}: TwoStrategiesCardProperties) {
    const { variant: variantA } = useBankrollVariant();

    const [riskB, setRiskB] = useState<Dollars | null>(null);
    const [start, setStart] = useState<Dollars | null>(null);
    const [horizonDays, setHorizonDays] = useState<null | number>(null);
    const [reinvestFraction, setReinvestFraction] =
        useState<Fraction0to1 | null>(null);

    const variantB =
        riskB === null ? null : bankrollVariantWithRisk(variantA, riskB);

    const canRun = variantB !== null && start !== null && horizonDays !== null;
    const requestKey = canRun
        ? stableJson({
              capacity: state.capacity,
              horizonDays,
              monthlyBudget: state.monthlyBudget,
              payoutLagDays: state.payoutLagDays,
              reinvestFraction,
              roundBudget: state.roundBudget,
              start,
              variantA,
              variantB,
          })
        : null;

    const buildRequest = useCallback(
        (runId: number) =>
            variantB === null || start === null || horizonDays === null
                ? null
                : bankrollTwoStrategiesRequest(
                      [variantA, variantB],
                      {
                          capacity: state.capacity,
                          horizonDays,
                          monthlyBudget: state.monthlyBudget,
                          payoutLagDays: state.payoutLagDays ?? 0,
                          reinvestFraction: reinvestFraction ?? fraction(0),
                          roundBudget: state.roundBudget,
                          start,
                      },
                      runId,
                  ),
        [
            horizonDays,
            reinvestFraction,
            start,
            state.capacity,
            state.monthlyBudget,
            state.payoutLagDays,
            state.roundBudget,
            variantA,
            variantB,
        ],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const results =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.TwoStrategies
            ? worker.state.result.results
            : null;
    const summaries =
        results === null ? null : bankrollTwoStrategiesSummary(results);
    const failureReason =
        canRun && worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    const cycleA = bankrollCycleInput(
        state.compareMultipleA,
        state.compareCycleDaysA,
    );
    const cycleB = bankrollCycleInput(
        state.compareMultipleB,
        state.compareCycleDaysB,
    );
    const figures =
        summaries === null ||
        cycleA === null ||
        cycleB === null ||
        start === null ||
        horizonDays === null
            ? null
            : bankrollCycleFigures(start, horizonDays, [cycleA, cycleB]);

    return (
        <section
            aria-labelledby="bankroll-two-strategies-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="bankroll-two-strategies-heading"
            >
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
                    onChange={(raw) =>
                        setHorizonDays(parseBankrollPositiveIntField(raw))
                    }
                />
                <NumberField
                    id="bankroll-two-strategies-reinvest"
                    label="Reinvest fraction (0 to 1)"
                    onChange={(raw) =>
                        setReinvestFraction(
                            parseBankrollReinvestFractionField(raw),
                        )
                    }
                />
                <NumberField
                    describedBy={
                        riskB === null ? undefined : RISK_B_CONFLICT_MESSAGE_ID
                    }
                    id="bankroll-two-strategies-risk-b"
                    label="Strategy B risk per trade ($)"
                    onChange={(raw) => setRiskB(parseBankrollDollarsField(raw))}
                />
                <NumberField
                    id="bankroll-two-strategies-cycle-multiple-a"
                    initial={state.compareMultipleA}
                    label="Strategy A cycle multiple (optional)"
                    onChange={(raw) =>
                        onChange({
                            compareMultipleA: parseBankrollMultipleField(raw),
                        })
                    }
                />
                <NumberField
                    id="bankroll-two-strategies-cycle-days-a"
                    initial={state.compareCycleDaysA}
                    label="Strategy A cycle length (trading days, optional)"
                    onChange={(raw) =>
                        onChange({
                            compareCycleDaysA:
                                parseBankrollPositiveIntField(raw),
                        })
                    }
                />
                <NumberField
                    id="bankroll-two-strategies-cycle-multiple-b"
                    initial={state.compareMultipleB}
                    label="Strategy B cycle multiple (optional)"
                    onChange={(raw) =>
                        onChange({
                            compareMultipleB: parseBankrollMultipleField(raw),
                        })
                    }
                />
                <NumberField
                    id="bankroll-two-strategies-cycle-days-b"
                    initial={state.compareCycleDaysB}
                    label="Strategy B cycle length (trading days, optional)"
                    onChange={(raw) =>
                        onChange({
                            compareCycleDaysB:
                                parseBankrollPositiveIntField(raw),
                        })
                    }
                />
            </div>
            {riskB === null ? null : (
                <p
                    className="text-xs text-amber-400"
                    id={RISK_B_CONFLICT_MESSAGE_ID}
                >
                    Strategy B: {BankrollLeverLabel.ConflictsWithHardRule3}
                </p>
            )}
            {summaries === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <StrategySummaryColumn label="A" summary={summaries[0]} />
                    <StrategySummaryColumn label="B" summary={summaries[1]} />
                </div>
            )}
            {figures === null ? null : (
                <ul
                    aria-label="Closed-form cycle illustration"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    {figures.map((figure, index) => (
                        <li key={index === 0 ? 'A' : 'B'}>
                            {BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL}, strategy{' '}
                            {index === 0 ? 'A' : 'B'} (
                            {bankrollCycleDescription(figure)}):{' '}
                            {figure.quantity.value === null
                                ? NOT_APPLICABLE
                                : formatGateCurrency(figure.quantity.value)}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function NumberField({
    describedBy,
    id,
    initial = null,
    label,
    onChange,
}: {
    describedBy?: string;
    id: string;
    initial?: null | number;
    label: string;
    onChange: (raw: string) => void;
}) {
    const [text, setText] = useState(() =>
        initial === null ? '' : String(initial),
    );
    return (
        <div className="flex flex-col gap-1">
            <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={id}
            >
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
            <p className="text-xs font-medium text-muted-foreground">
                Strategy {label}
            </p>
            <StatCard
                label="Final bankroll (P10 / P50 / P90)"
                value={`${formatGateCurrency(summary.finalCashP10)} / ${formatGateCurrency(summary.finalCashP50)} / ${formatGateCurrency(summary.finalCashP90)}`}
            />
            <StatCard
                label="Multiple (P50 cash / start)"
                value={
                    summary.multiple === null
                        ? NOT_APPLICABLE
                        : `${summary.multiple.toFixed(2)}x`
                }
            />
            <StatCard
                label="Measured cycle days"
                value={
                    summary.measuredCycleDays === null
                        ? NOT_APPLICABLE
                        : summary.measuredCycleDays.toFixed(1)
                }
            />
        </div>
    );
}
