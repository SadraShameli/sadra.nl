'use client';

import { useCallback, useMemo, useState } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import {
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import { stableJson } from '~/lib/stableJson';

import {
    BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL,
    bankrollClosedFormIllustration,
    bankrollProjectionRequest,
    bankrollProjectionSummary,
} from './bankrollModel';
import {
    type BankrollUrlState,
    parseBankrollDollarsField,
    parseBankrollNonNegativeIntField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

interface ProjectionCardProperties {
    onChange: (patch: Partial<BankrollUrlState>) => void;
    state: BankrollUrlState;
}

export function ProjectionCard({ onChange, state }: ProjectionCardProperties) {
    const { variant } = useBankrollVariant();

    const policy = useMemo(
        () =>
            state.start === null || state.horizonDays === null
                ? null
                : {
                      capacity: state.capacity,
                      horizonDays: state.horizonDays,
                      monthlyBudget: state.monthlyBudget,
                      payoutLagDays: state.payoutLagDays ?? 0,
                      reinvestFraction: state.reinvestFraction ?? fraction(0),
                      start: state.start,
                  },
        [
            state.capacity,
            state.horizonDays,
            state.monthlyBudget,
            state.payoutLagDays,
            state.reinvestFraction,
            state.start,
        ],
    );
    const requestKey = policy === null ? null : stableJson({ policy, variant });

    const buildRequest = useCallback(
        (runId: number) =>
            policy === null
                ? null
                : bankrollProjectionRequest(variant, policy, runId),
        [policy, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const result =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.Projection
            ? worker.state.result.result
            : null;
    const summary = result === null ? null : bankrollProjectionSummary(result);
    const failureReason =
        worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    const illustration =
        state.start === null || state.horizonDays === null
            ? null
            : bankrollClosedFormIllustration(
                  state.start,
                  state.reinvestFraction ?? fraction(0),
                  state.horizonDays,
              );

    return (
        <section
            aria-labelledby="bankroll-projection-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="bankroll-projection-heading"
            >
                Projection
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                    label="Starting bankroll ($)"
                    onChange={(raw) =>
                        onChange({ start: parseBankrollDollarsField(raw) })
                    }
                    testId="bankroll-start"
                    value={state.start}
                />
                <NumberField
                    label="Monthly budget ($, optional)"
                    onChange={(raw) =>
                        onChange({
                            monthlyBudget: parseBankrollDollarsField(raw),
                        })
                    }
                    testId="bankroll-monthly-budget"
                    value={state.monthlyBudget}
                />
                <NumberField
                    label="Reinvest fraction (0 to 1)"
                    onChange={(raw) =>
                        onChange({
                            reinvestFraction:
                                parseBankrollReinvestFractionField(raw),
                        })
                    }
                    testId="bankroll-reinvest"
                    value={state.reinvestFraction}
                />
                <NumberField
                    label="Capacity (max concurrent accounts, optional)"
                    onChange={(raw) =>
                        onChange({
                            capacity: parseBankrollPositiveIntField(raw),
                        })
                    }
                    testId="bankroll-capacity"
                    value={state.capacity}
                />
                <NumberField
                    label="Payout lag (days)"
                    onChange={(raw) =>
                        onChange({
                            payoutLagDays:
                                parseBankrollNonNegativeIntField(raw),
                        })
                    }
                    testId="bankroll-payout-lag"
                    value={state.payoutLagDays}
                />
                <NumberField
                    label="Horizon (trading days)"
                    onChange={(raw) =>
                        onChange({
                            horizonDays: parseBankrollPositiveIntField(raw),
                        })
                    }
                    testId="bankroll-horizon"
                    value={state.horizonDays}
                />
            </div>
            {summary === null ? (
                failureReason === null ? (
                    <p className="text-sm text-muted-foreground">
                        Enter a starting bankroll and a horizon to project.
                    </p>
                ) : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <StatCard
                        label="Final bankroll (P10 / P50 / P90)"
                        value={`${formatGateCurrency(summary.finalCashP10)} / ${formatGateCurrency(summary.finalCashP50)} / ${formatGateCurrency(summary.finalCashP90)}`}
                    />
                    <StatCard
                        label="Path ruin"
                        value={formatPercent(summary.pathRuin)}
                    />
                    <StatCard
                        label="P(final net < 0)"
                        value={formatPercent(summary.pFinalNetNegative)}
                    />
                    <StatCard
                        label="Cards bought (median)"
                        value={summary.cardsBoughtMedian.toFixed(1)}
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
            )}
            {illustration === null ? null : (
                <p className="text-xs text-muted-foreground">
                    {BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL}:{' '}
                    {illustration.value === null
                        ? NOT_APPLICABLE
                        : formatGateCurrency(illustration.value)}
                </p>
            )}
        </section>
    );
}

function NumberField({
    label,
    onChange,
    testId,
    value,
}: {
    label: string;
    onChange: (raw: string) => void;
    testId: string;
    value: null | number;
}) {
    const [text, setText] = useState(() =>
        value === null ? '' : String(value),
    );
    return (
        <div className="flex flex-col gap-1">
            <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={testId}
            >
                {label}
            </label>
            <Input
                id={testId}
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
