'use client';

import { useCallback } from 'react';

import { useBaseResult } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { useSession } from '~/lib/auth/client';
import {
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import {
    ECONOMICS_REASON_TEXT,
    EconomicsReason,
} from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';
import { api } from '~/trpc/react';

import {
    bankrollBatchRequest,
    bankrollBudgetPricing,
    BankrollSetupStatus,
    bankrollSetupSummary,
    NO_POSITIVE_EDGE_TEXT,
} from './bankrollModel';
import {
    type BankrollUrlState,
    parseBankrollDollarsField,
    parseBankrollLossThresholdField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

interface SetupCardProperties {
    onChange: (patch: Partial<BankrollUrlState>) => void;
    state: BankrollUrlState;
}

export function SetupCard({ onChange, state }: SetupCardProperties) {
    const { rulebook, variant } = useBankrollVariant();
    const baseResult = useBaseResult();
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const bankrollSummaryQuery = api.propAccounts.bankroll.summary.useQuery(
        undefined,
        {
            enabled: hasSession,
        },
    );

    const out = baseResult.result;
    const rulebookThreshold = rulebook.bankroll.lossRiskThreshold;
    const lossThreshold =
        state.lossThreshold ??
        (rulebookThreshold === null ? null : fraction(rulebookThreshold));
    const summary =
        out === null ? null : bankrollSetupSummary(out, lossThreshold);

    const budget = state.budget;
    const canPrice =
        out !== null &&
        !baseResult.isPending &&
        budget !== null &&
        summary?.status === BankrollSetupStatus.Priced;
    const requestKey = canPrice ? stableJson({ budget, variant }) : null;

    const buildRequest = useCallback(
        (runId: number) =>
            out === null || budget === null
                ? null
                : bankrollBatchRequest(variant, out, budget, runId),
        [budget, out, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const batch =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.Batch
            ? worker.state.result.result
            : null;

    const pricing =
        out === null || budget === null
            ? null
            : bankrollBudgetPricing(out, budget, batch);

    const failureReason =
        budget !== null && worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    const availableCents = bankrollSummaryQuery.data?.availableCents ?? null;

    return (
        <section
            aria-labelledby="bankroll-setup-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="bankroll-setup-heading"
            >
                Setup
            </h2>
            <div className="flex flex-col gap-1">
                <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="bankroll-budget"
                >
                    Budget ($)
                </label>
                <Input
                    id="bankroll-budget"
                    inputMode="decimal"
                    onChange={(event) => {
                        onChange({
                            budget: parseBankrollDollarsField(
                                event.target.value,
                            ),
                        });
                    }}
                    placeholder="Enter your budget"
                    type="number"
                    value={state.budget === null ? '' : String(state.budget)}
                />
                {availableCents === null ? null : (
                    <button
                        className="w-fit text-xs text-primary underline"
                        onClick={() =>
                            onChange({
                                budget: parseBankrollDollarsField(
                                    String(availableCents / 100),
                                ),
                            })
                        }
                        type="button"
                    >
                        Use your available bankroll (
                        {formatGateCurrency(availableCents / 100)})
                    </button>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="bankroll-loss-threshold"
                >
                    Loss-risk threshold (0 to 0.5, optional)
                </label>
                <Input
                    id="bankroll-loss-threshold"
                    inputMode="decimal"
                    onChange={(event) => {
                        onChange({
                            lossThreshold: parseBankrollLossThresholdField(
                                event.target.value,
                            ),
                        });
                    }}
                    placeholder="e.g. 0.1"
                    type="number"
                    value={
                        state.lossThreshold === null
                            ? ''
                            : String(state.lossThreshold)
                    }
                />
            </div>
            {summary === null ? null : summary.status ===
              BankrollSetupStatus.NoPositiveEdge ? (
                <p className="text-sm text-amber-400">
                    {NO_POSITIVE_EDGE_TEXT}
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <StatCard
                        label="Attempt cost"
                        value={formatGateCurrency(summary.attemptCost)}
                    />
                    <StatCard
                        label="P(attempt pays)"
                        value={formatPercent(
                            summary.attemptPaysProbability.value,
                        )}
                    />
                    <StatCard
                        label="Attempts affordable"
                        value={
                            pricing?.attempts === null ||
                            pricing?.attempts === undefined
                                ? NOT_APPLICABLE
                                : String(pricing.attempts)
                        }
                    />
                    <StatCard
                        label="P(batch net < 0)"
                        sub="headline"
                        value={
                            pricing?.batchNetNegativeProbability === null ||
                            pricing?.batchNetNegativeProbability === undefined
                                ? pricing?.batchNetNegativeReason == null
                                    ? NOT_APPLICABLE
                                    : ECONOMICS_REASON_TEXT[
                                          pricing.batchNetNegativeReason
                                      ]
                                : formatPercent(
                                      pricing.batchNetNegativeProbability,
                                  )
                        }
                    />
                    <StatCard
                        label={`P(no payout from ${pricing?.attempts ?? 0} attempts)`}
                        sub="ignores payout size"
                        value={
                            pricing?.noPayoutProbability === null ||
                            pricing?.noPayoutProbability === undefined
                                ? NOT_APPLICABLE
                                : formatPercent(pricing.noPayoutProbability, 3)
                        }
                    />
                    <StatCard
                        label="Minimum budget for your threshold"
                        value={
                            summary.minimumBudget.value === null
                                ? summary.minimumBudget.reason ===
                                  EconomicsReason.ThresholdNotSet
                                    ? 'threshold not set'
                                    : NOT_APPLICABLE
                                : `${formatGateCurrency(summary.minimumBudget.value.budget)} (${summary.minimumBudget.value.attempts} attempts)`
                        }
                    />
                </div>
            )}
            {failureReason === null ? null : (
                <p className="text-xs text-rose-400" role="alert">
                    {failureReason}
                </p>
            )}
        </section>
    );
}
