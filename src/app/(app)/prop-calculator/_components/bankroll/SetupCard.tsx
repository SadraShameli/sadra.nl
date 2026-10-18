'use client';

import { BookOpen } from 'lucide-react';
import { type ReactNode, useCallback, useMemo } from 'react';

import {
    useBaseResult,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ValueOrMissing } from '~/app/(app)/prop-calculator/_components/ValueOrMissing';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { LabelWithInfo } from '~/components/LabelWithInfo';
import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip, type StatStripItem } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { useSession } from '~/lib/auth/client';
import { formatPercent, formatWholeOrCentsCurrency } from '~/lib/format';
import { type RealizedLossRisk } from '~/lib/prop-accounts/bankroll';
import {
    type Dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator';
import {
    ECONOMICS_REASON_TEXT,
    EconomicsReason,
    type Quantity,
} from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';
import { api } from '~/trpc/react';

import {
    bankrollBudgetCheck,
    BankrollBudgetCheckKind,
    bankrollBudgetShortText,
} from './bankrollBudgetCheck';
import { BankrollField } from './BankrollField';
import {
    type BankrollBudgetPricing,
    bankrollBudgetPricing,
    bankrollDistributionBatchRequest,
    BankrollSetupStatus,
    type BankrollSetupSummary,
    bankrollSetupSummary,
    NO_POSITIVE_EDGE_TEXT,
} from './bankrollModel';
import {
    BankrollEmptyResult,
    BankrollRunFailure,
    isAwaitingToolsResult,
} from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { readyValue } from './bankrollStatItems';
import {
    type BankrollUrlState,
    parseBankrollDollarsField,
    parseBankrollLossThresholdField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import {
    RealizedBankrollRiskStatus,
    useRealizedBankrollRisk,
} from './useRealizedBankrollRisk';
import { useToolsRequest } from './useToolsRequest';

const REALIZED_HEADING = 'Realized, from your ledger';
const THRESHOLD_NOT_SET_TEXT = 'Threshold not set';
const UNKNOWN_ATTEMPTS = 'N';

interface RealizedRiskSectionProperties {
    budget: Dollars | null;
    costPerAttempt: number;
    lossThreshold: Fraction0to1 | null;
    userId: string;
}

interface SetupCardProperties {
    onChange: (patch: Partial<BankrollUrlState>) => void;
    state: BankrollUrlState;
}

export function SetupCard({ onChange, state }: SetupCardProperties) {
    const { rulebook } = useBankrollVariant();
    const baseResult = useBaseResult();
    const { state: calculatorState } = useCalculatorInputs();
    const session = useSession();
    const userId = session.data?.user.id;
    const hasSession = userId !== undefined;
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
    const summary = useMemo(
        () => (out === null ? null : bankrollSetupSummary(out, lossThreshold)),
        [lossThreshold, out],
    );

    const budget = state.budget;
    const budgetCheck =
        summary?.status === BankrollSetupStatus.Priced
            ? bankrollBudgetCheck(budget, summary.minimumBudget)
            : null;
    const canPrice =
        out !== null &&
        !baseResult.isPending &&
        budget !== null &&
        summary?.status === BankrollSetupStatus.Priced;
    const seed = calculatorState.seed;
    const distributionKey = useMemo(
        () =>
            out === null
                ? null
                : stableJson({
                      costPerAttempt: out.costPerAttempt,
                      netValues: out.netValues,
                      seed,
                  }),
        [out, seed],
    );
    const requestKey =
        canPrice && distributionKey !== null
            ? stableJson({ budget, distributionKey })
            : null;

    const buildRequest = useCallback(
        (runId: number) =>
            out === null || budget === null
                ? null
                : bankrollDistributionBatchRequest(out, budget, seed, runId),
        [budget, out, seed],
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

    const availableCents = bankrollSummaryQuery.data?.availableCents ?? null;
    const isBasePending = out === null && baseResult.error === null;
    const isBatchPending =
        baseResult.isPending ||
        (requestKey !== null && isAwaitingToolsResult(worker.state));

    return (
        <BankrollSection
            headingId="bankroll-setup-heading"
            info="Enter what you can spend on attempts. The cards price how likely that batch ends net negative and the budget your loss-risk threshold needs."
            inputs={
                <>
                    <Field>
                        <LabelWithInfo
                            htmlFor="bankroll-budget"
                            info="What you can spend on attempts, in dollars."
                            label="Budget"
                        />
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
                            value={
                                state.budget === null
                                    ? ''
                                    : String(state.budget)
                            }
                        />
                        {availableCents === null ||
                        availableCents <= 0 ? null : (
                            <Button
                                className="w-fit px-0"
                                onClick={() =>
                                    onChange({
                                        budget: parseBankrollDollarsField(
                                            String(availableCents / 100),
                                        ),
                                    })
                                }
                                size="sm"
                                type="button"
                                variant="link"
                            >
                                Use your available bankroll (
                                {formatWholeOrCentsCurrency(
                                    availableCents / 100,
                                )}
                                )
                            </Button>
                        )}
                    </Field>
                    <BankrollField
                        id="bankroll-loss-threshold"
                        info="Optional. The highest chance you accept of the batch ending net negative, from 0 to 0.5. Empty uses your rulebook threshold when it sets one."
                        initial={state.lossThreshold}
                        label="Loss-risk threshold"
                        onChange={(raw) =>
                            onChange({
                                lossThreshold:
                                    parseBankrollLossThresholdField(raw),
                            })
                        }
                        placeholder="e.g. 0.1"
                    />
                </>
            }
            isComputing={isBasePending || isBatchPending}
            results={
                <>
                    {calculatorState.maxAttempts > 1 ? (
                        <StatusRow
                            title={`The calculator's max attempts is ${String(calculatorState.maxAttempts)}, but the figures below treat each trial as one attempt. Set it to 1 for per-attempt pricing.`}
                            tone={StatusTone.Warn}
                        />
                    ) : null}
                    {summary === null ? (
                        isBasePending ? (
                            <StatStrip isLoading items={attemptItems(null)} />
                        ) : null
                    ) : summary.status ===
                      BankrollSetupStatus.NoPositiveEdge ? (
                        <StatusRow
                            title={NO_POSITIVE_EDGE_TEXT}
                            tone={StatusTone.Warn}
                        />
                    ) : (
                        <>
                            <StatStrip
                                items={attemptItems(summary)}
                                label="Per attempt"
                            />
                            {pricing === null ? (
                                <BankrollEmptyResult text="Enter a budget to price the batch it buys." />
                            ) : (
                                <StatStrip
                                    items={budgetItems(pricing, isBatchPending)}
                                    label="Your budget"
                                />
                            )}
                        </>
                    )}
                    {budgetCheck?.kind === BankrollBudgetCheckKind.Short ? (
                        <StatusRow
                            title={bankrollBudgetShortText(budgetCheck)}
                            tone={StatusTone.Fail}
                        />
                    ) : null}
                    <BankrollRunFailure state={worker.state} />
                    {out === null || userId === undefined ? null : (
                        <RealizedRiskSection
                            budget={budget}
                            costPerAttempt={out.costPerAttempt}
                            lossThreshold={lossThreshold}
                            userId={userId}
                        />
                    )}
                </>
            }
            title="Setup"
        />
    );
}

function attemptItems(
    summary: BankrollSetupSummary | null,
): readonly StatStripItem[] {
    return [
        {
            id: 'attempt-cost',
            label: 'Attempt cost',
            value: readyValue(summary, (ready) =>
                formatWholeOrCentsCurrency(ready.attemptCost),
            ),
        },
        {
            id: 'attempt-pays',
            label: 'P(attempt pays)',
            value: readyValue(summary, (ready) =>
                formatPercent(ready.attemptPaysProbability.value),
            ),
        },
        {
            id: 'minimum-budget',
            label: 'Minimum budget for your threshold',
            value: readyValue(summary, (ready) =>
                ready.minimumBudget.value === null ? (
                    ready.minimumBudget.reason ===
                    EconomicsReason.ThresholdNotSet ? (
                        THRESHOLD_NOT_SET_TEXT
                    ) : (
                        <MissingValue />
                    )
                ) : (
                    `${formatWholeOrCentsCurrency(ready.minimumBudget.value.budget)} (${String(ready.minimumBudget.value.attempts)} attempts)`
                ),
            ),
        },
    ];
}

function budgetItems(
    pricing: BankrollBudgetPricing,
    isBatchPending: boolean,
): readonly StatStripItem[] {
    return [
        {
            id: 'attempts-affordable',
            label: 'Attempts affordable',
            value:
                pricing.attempts === null ? (
                    <MissingValue />
                ) : (
                    String(pricing.attempts)
                ),
        },
        {
            caption: 'headline',
            id: 'batch-net-negative',
            isLoading: isBatchPending,
            label: 'P(batch net < 0)',
            value:
                pricing.batchNetNegativeProbability === null ? (
                    pricing.batchNetNegativeReason === null ? (
                        <MissingValue />
                    ) : (
                        ECONOMICS_REASON_TEXT[pricing.batchNetNegativeReason]
                    )
                ) : (
                    formatPercent(pricing.batchNetNegativeProbability)
                ),
        },
        {
            caption: 'ignores payout size',
            id: 'no-payout',
            label: noPayoutLabel(pricing.attempts ?? 0),
            value:
                pricing.noPayoutProbability === null ? (
                    <MissingValue />
                ) : (
                    formatPercent(pricing.noPayoutProbability, 3)
                ),
        },
    ];
}

function noPayoutLabel(attempts: null | number): string {
    return `P(no payout from ${attempts === null ? UNKNOWN_ATTEMPTS : String(attempts)} attempts)`;
}

function RealizedFigures({
    children,
    costPerAttempt,
    risk,
}: {
    readonly children?: ReactNode;
    readonly costPerAttempt: number;
    readonly risk: null | RealizedLossRisk;
}) {
    return (
        <div className="flex flex-col gap-3">
            <PanelSubheading>{REALIZED_HEADING}</PanelSubheading>
            {children}
            <StatStrip
                isLoading={risk === null}
                items={realizedItems(risk, costPerAttempt)}
                label="Realized"
            />
        </div>
    );
}

function realizedItems(
    risk: null | RealizedLossRisk,
    costPerAttempt: number,
): readonly StatStripItem[] {
    return [
        {
            caption: readyValue(risk, (ready) =>
                ready.attemptPaysRate === null
                    ? undefined
                    : `n = ${String(ready.attemptPaysRate.n)}`,
            ),
            id: 'realized-attempt-pays',
            label: 'Realized P(attempt pays)',
            value: readyValue(risk, (ready) =>
                ready.attemptPaysRate === null ? (
                    <MissingValue />
                ) : (
                    formatPercent(ready.attemptPaysRate.value)
                ),
            ),
        },
        {
            id: 'realized-batch-net-negative',
            label: 'Realized P(batch net < 0)',
            value: readyValue(risk, (ready) =>
                ready.batchLossProbability === null ? (
                    <MissingValue />
                ) : (
                    formatPercent(ready.batchLossProbability.value)
                ),
            ),
        },
        {
            caption: 'ignores payout size',
            id: 'realized-no-payout',
            label: `Realized ${noPayoutLabel(risk === null ? null : (risk.attempts ?? 0))}`,
            value: readyValue(risk, (ready) =>
                ready.noPayoutProbability === null ? (
                    <MissingValue />
                ) : (
                    formatPercent(ready.noPayoutProbability, 3)
                ),
            ),
        },
        {
            id: 'realized-minimum-budget',
            label: 'Realized minimum budget',
            value: readyValue(risk, (ready) => (
                <ValueOrMissing
                    value={realizedMinimumBudgetText(
                        ready.minimumBudget,
                        costPerAttempt,
                    )}
                />
            )),
        },
    ];
}

function realizedMinimumBudgetText(
    minimumBudget: Quantity<Dollars>,
    costPerAttempt: number,
): null | string {
    if (minimumBudget.value !== null) {
        return `${formatWholeOrCentsCurrency(minimumBudget.value)} (${String(Math.round(minimumBudget.value / costPerAttempt))} attempts)`;
    }
    return minimumBudget.reason === EconomicsReason.ThresholdNotSet
        ? THRESHOLD_NOT_SET_TEXT
        : null;
}

function RealizedRiskSection({
    budget,
    costPerAttempt,
    lossThreshold,
    userId,
}: RealizedRiskSectionProperties) {
    const realized = useRealizedBankrollRisk({
        budget,
        costPerAttempt,
        lossThreshold,
        userId,
    });

    switch (realized.status) {
        case RealizedBankrollRiskStatus.Failed: {
            return (
                <Alert variant="destructive">
                    <AlertDescription>
                        Your realized figures could not be loaded.
                    </AlertDescription>
                </Alert>
            );
        }
        case RealizedBankrollRiskStatus.Loading: {
            return (
                <RealizedFigures costPerAttempt={costPerAttempt} risk={null} />
            );
        }
        case RealizedBankrollRiskStatus.Ready: {
            const { risk } = realized;
            if (risk.sampleCount === 0) {
                return (
                    <div className="flex flex-col gap-3">
                        <PanelSubheading>{REALIZED_HEADING}</PanelSubheading>
                        <EmptyState
                            description="Realized figures appear once your ledger has an ended attempt."
                            icon={BookOpen}
                            size={EmptyStateSize.Compact}
                            title="No ended attempts yet"
                        />
                    </div>
                );
            }
            return (
                <RealizedFigures costPerAttempt={costPerAttempt} risk={risk}>
                    <p className="text-xs text-muted-foreground">
                        {`Based on ${String(risk.sampleCount)} ended attempts, priced at this plan's attempt cost.`}
                    </p>
                    {risk.reason === EconomicsReason.NoPositiveEdge ? (
                        <StatusRow
                            title="Realized: no positive edge in your ended attempts, so no budget makes this safe."
                            tone={StatusTone.Warn}
                        />
                    ) : null}
                </RealizedFigures>
            );
        }
    }
}
