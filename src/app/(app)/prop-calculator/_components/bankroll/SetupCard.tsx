'use client';

import { useCallback, useMemo } from 'react';

import {
    useBaseResult,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { InfoNote } from '~/components/InfoNote';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { useSession } from '~/lib/auth/client';
import {
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
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
import {
    bankrollBudgetPricing,
    bankrollDistributionBatchRequest,
    BankrollSetupStatus,
    bankrollSetupSummary,
    NO_POSITIVE_EDGE_TEXT,
} from './bankrollModel';
import { BankrollRunStatus } from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
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

const THRESHOLD_NOT_SET_TEXT = 'Threshold not set';

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

    return (
        <BankrollSection
            description="Enter what you can spend on attempts. The cards price how likely that batch ends net negative and the budget your loss-risk threshold needs."
            headingId="bankroll-setup-heading"
            title="Setup"
        >
            <Field>
                <FieldLabel htmlFor="bankroll-budget">Budget ($)</FieldLabel>
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
                {availableCents === null || availableCents <= 0 ? null : (
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
                        {formatGateCurrency(availableCents / 100)})
                    </Button>
                )}
            </Field>
            <Field>
                <FieldLabel htmlFor="bankroll-loss-threshold">
                    Loss-risk threshold (0 to 0.5, optional)
                </FieldLabel>
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
            </Field>
            {calculatorState.maxAttempts > 1 ? (
                <StatusRow
                    title={`The calculator's max attempts is ${String(calculatorState.maxAttempts)}, but the figures below treat each trial as one attempt. Set it to 1 for per-attempt pricing.`}
                    tone={StatusTone.Warn}
                />
            ) : null}
            {summary === null ? null : summary.status ===
              BankrollSetupStatus.NoPositiveEdge ? (
                <StatusRow
                    title={NO_POSITIVE_EDGE_TEXT}
                    tone={StatusTone.Warn}
                />
            ) : (
                <StatStrip
                    items={[
                        {
                            id: 'attempt-cost',
                            label: 'Attempt cost',
                            value: formatGateCurrency(summary.attemptCost),
                        },
                        {
                            id: 'attempt-pays',
                            label: 'P(attempt pays)',
                            value: formatPercent(
                                summary.attemptPaysProbability.value,
                            ),
                        },
                        {
                            id: 'attempts-affordable',
                            label: 'Attempts affordable',
                            value:
                                pricing?.attempts === null ||
                                pricing?.attempts === undefined
                                    ? NOT_APPLICABLE
                                    : String(pricing.attempts),
                        },
                        {
                            caption: 'headline',
                            id: 'batch-net-negative',
                            label: 'P(batch net < 0)',
                            value:
                                pricing?.batchNetNegativeProbability === null ||
                                pricing?.batchNetNegativeProbability ===
                                    undefined
                                    ? pricing?.batchNetNegativeReason == null
                                        ? NOT_APPLICABLE
                                        : ECONOMICS_REASON_TEXT[
                                              pricing.batchNetNegativeReason
                                          ]
                                    : formatPercent(
                                          pricing.batchNetNegativeProbability,
                                      ),
                        },
                        {
                            caption: 'ignores payout size',
                            id: 'no-payout',
                            label: `P(no payout from ${pricing?.attempts ?? 0} attempts)`,
                            value:
                                pricing?.noPayoutProbability === null ||
                                pricing?.noPayoutProbability === undefined
                                    ? NOT_APPLICABLE
                                    : formatPercent(
                                          pricing.noPayoutProbability,
                                          3,
                                      ),
                        },
                        {
                            id: 'minimum-budget',
                            label: 'Minimum budget for your threshold',
                            value:
                                summary.minimumBudget.value === null
                                    ? summary.minimumBudget.reason ===
                                      EconomicsReason.ThresholdNotSet
                                        ? THRESHOLD_NOT_SET_TEXT
                                        : NOT_APPLICABLE
                                    : `${formatGateCurrency(summary.minimumBudget.value.budget)} (${summary.minimumBudget.value.attempts} attempts)`,
                        },
                    ]}
                />
            )}
            {budgetCheck?.kind === BankrollBudgetCheckKind.Short ? (
                <StatusRow
                    title={bankrollBudgetShortText(budgetCheck)}
                    tone={StatusTone.Fail}
                />
            ) : null}
            <BankrollRunStatus
                isRequested={budget !== null}
                state={worker.state}
            />
            {out === null || userId === undefined ? null : (
                <RealizedRiskSection
                    budget={budget}
                    costPerAttempt={out.costPerAttempt}
                    lossThreshold={lossThreshold}
                    userId={userId}
                />
            )}
        </BankrollSection>
    );
}

function realizedMinimumBudgetText(
    minimumBudget: Quantity<Dollars>,
    costPerAttempt: number,
): string {
    if (minimumBudget.value !== null) {
        return `${formatGateCurrency(minimumBudget.value)} (${String(Math.round(minimumBudget.value / costPerAttempt))} attempts)`;
    }
    return minimumBudget.reason === EconomicsReason.ThresholdNotSet
        ? THRESHOLD_NOT_SET_TEXT
        : NOT_APPLICABLE;
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
            return <InfoNote>Loading your realized figures.</InfoNote>;
        }
        case RealizedBankrollRiskStatus.Ready: {
            const { risk } = realized;
            if (risk.sampleCount === 0) {
                return (
                    <InfoNote>
                        Realized figures: no ended attempts in your ledger yet.
                    </InfoNote>
                );
            }
            return (
                <div className="flex flex-col gap-3">
                    <PanelSubheading>
                        Realized, from your ledger
                    </PanelSubheading>
                    <p className="text-xs text-muted-foreground">
                        {`Based on ${String(risk.sampleCount)} ended attempts, priced at this plan's attempt cost.`}
                    </p>
                    {risk.reason === EconomicsReason.NoPositiveEdge ? (
                        <StatusRow
                            title="Realized: no positive edge in your ended attempts, so no budget makes this safe."
                            tone={StatusTone.Warn}
                        />
                    ) : null}
                    <StatStrip
                        items={[
                            {
                                caption:
                                    risk.attemptPaysRate === null
                                        ? undefined
                                        : `n = ${String(risk.attemptPaysRate.n)}`,
                                id: 'realized-attempt-pays',
                                label: 'Realized P(attempt pays)',
                                value:
                                    risk.attemptPaysRate === null
                                        ? NOT_APPLICABLE
                                        : formatPercent(
                                              risk.attemptPaysRate.value,
                                          ),
                            },
                            {
                                id: 'realized-batch-net-negative',
                                label: 'Realized P(batch net < 0)',
                                value:
                                    risk.batchLossProbability === null
                                        ? NOT_APPLICABLE
                                        : formatPercent(
                                              risk.batchLossProbability.value,
                                          ),
                            },
                            {
                                caption: 'ignores payout size',
                                id: 'realized-no-payout',
                                label: `Realized P(no payout from ${String(risk.attempts ?? 0)} attempts)`,
                                value:
                                    risk.noPayoutProbability === null
                                        ? NOT_APPLICABLE
                                        : formatPercent(
                                              risk.noPayoutProbability,
                                              3,
                                          ),
                            },
                            {
                                id: 'realized-minimum-budget',
                                label: 'Realized minimum budget',
                                value: realizedMinimumBudgetText(
                                    risk.minimumBudget,
                                    costPerAttempt,
                                ),
                            },
                        ]}
                    />
                </div>
            );
        }
    }
}
