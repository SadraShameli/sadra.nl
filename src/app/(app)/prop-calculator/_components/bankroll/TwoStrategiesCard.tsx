'use client';

import { useCallback, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { Separator } from '~/components/ui/separator';
import { formatWholeOrCentsCurrency } from '~/lib/format';
import {
    type Dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator';
import { stableJson } from '~/lib/stableJson';

import { BankrollField, BankrollFieldKind } from './BankrollField';
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
    BankrollRunStatus,
    isAwaitingRequestedResult,
} from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { growthStatItems, readyValue } from './bankrollStatItems';
import {
    type BankrollViewState,
    parseBankrollDollarsField,
    parseBankrollMultipleField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from './bankrollUrlState';
import { StrategyBRiskField } from './StrategyBRiskField';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

const RISK_B_CONFLICT_MESSAGE_ID = 'bankroll-two-strategies-risk-b-conflict';

interface TwoStrategiesCardProperties {
    onChange: (patch: Partial<BankrollViewState>) => void;
    state: BankrollViewState;
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
        <BankrollSection
            headingId="bankroll-two-strategies-heading"
            info="Compares strategy A (your current risk) against strategy B (an alternate risk), on the same seed and the same bankroll policy. Capacity, monthly budget, payout lag and round budget come from Projection."
            inputs={
                <>
                    <BankrollField
                        id="bankroll-two-strategies-start"
                        info="The cash both strategies start with, in dollars."
                        label="Starting bankroll"
                        onChange={(raw) =>
                            setStart(parseBankrollDollarsField(raw))
                        }
                    />
                    <BankrollField
                        id="bankroll-two-strategies-horizon"
                        info="How many trading days to simulate."
                        kind={BankrollFieldKind.Integer}
                        label="Horizon"
                        onChange={(raw) =>
                            setHorizonDays(parseBankrollPositiveIntField(raw))
                        }
                    />
                    <BankrollField
                        id="bankroll-two-strategies-reinvest"
                        info="The share of each payout put back into the bankroll, from 0 to 1. Empty means 0: every payout is withdrawn."
                        label="Reinvest fraction"
                        onChange={(raw) =>
                            setReinvestFraction(
                                parseBankrollReinvestFractionField(raw),
                            )
                        }
                    />
                    <StrategyBRiskField
                        conflictId={RISK_B_CONFLICT_MESSAGE_ID}
                        id="bankroll-two-strategies-risk-b"
                        onChange={setRiskB}
                        risk={riskB}
                    />
                    <Separator />
                    <PanelSubheading info="Optional. A deterministic figure, not a forecast: the bankroll multiplied by the cycle multiple once per cycle over the horizon. It shows once both strategies have a multiple and a length.">
                        Cycle illustration
                    </PanelSubheading>
                    <BankrollField
                        id="bankroll-two-strategies-cycle-multiple-a"
                        info="Optional. How many times strategy A's bankroll grows per cycle."
                        initial={state.compareMultipleA}
                        label="A cycle multiple"
                        onChange={(raw) =>
                            onChange({
                                compareMultipleA:
                                    parseBankrollMultipleField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-two-strategies-cycle-days-a"
                        info="Optional. Trading days per strategy A cycle."
                        initial={state.compareCycleDaysA}
                        kind={BankrollFieldKind.Integer}
                        label="A cycle length"
                        onChange={(raw) =>
                            onChange({
                                compareCycleDaysA:
                                    parseBankrollPositiveIntField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-two-strategies-cycle-multiple-b"
                        info="Optional. How many times strategy B's bankroll grows per cycle."
                        initial={state.compareMultipleB}
                        label="B cycle multiple"
                        onChange={(raw) =>
                            onChange({
                                compareMultipleB:
                                    parseBankrollMultipleField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-two-strategies-cycle-days-b"
                        info="Optional. Trading days per strategy B cycle."
                        initial={state.compareCycleDaysB}
                        kind={BankrollFieldKind.Integer}
                        label="B cycle length"
                        onChange={(raw) =>
                            onChange({
                                compareCycleDaysB:
                                    parseBankrollPositiveIntField(raw),
                            })
                        }
                    />
                </>
            }
            isComputing={isAwaitingRequestedResult(canRun, worker.state)}
            results={
                <>
                    {summaries === null ? (
                        <BankrollRunStatus
                            emptyText="Enter a starting bankroll, a horizon and a strategy B risk to compare."
                            isRequested={canRun}
                            skeleton={
                                <>
                                    <StrategySummary label="A" summary={null} />
                                    <StrategySummary label="B" summary={null} />
                                </>
                            }
                            state={worker.state}
                        />
                    ) : (
                        <>
                            <StrategySummary label="A" summary={summaries[0]} />
                            <StrategySummary label="B" summary={summaries[1]} />
                        </>
                    )}
                    {figures === null ? null : (
                        <ul
                            aria-label="Closed-form cycle illustration"
                            className="flex flex-col gap-1 text-xs text-muted-foreground"
                        >
                            {figures.map((figure, index) => (
                                <li key={index === 0 ? 'A' : 'B'}>
                                    {BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL},
                                    strategy {index === 0 ? 'A' : 'B'} (
                                    {bankrollCycleDescription(figure)}):{' '}
                                    {figure.quantity.value === null ? (
                                        <MissingValue />
                                    ) : (
                                        formatWholeOrCentsCurrency(
                                            figure.quantity.value,
                                        )
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            }
            title="Two strategies"
        />
    );
}

function StrategySummary({
    label,
    summary,
}: {
    readonly label: string;
    readonly summary: BankrollProjectionSummary | null;
}) {
    return (
        <div className="flex flex-col gap-3">
            <PanelSubheading>Strategy {label}</PanelSubheading>
            <StatStrip
                isLoading={summary === null}
                items={[
                    {
                        id: 'final-bankroll',
                        label: 'Final bankroll (P10 / P50 / P90)',
                        value: readyValue(
                            summary,
                            (ready) =>
                                `${formatWholeOrCentsCurrency(ready.finalCashP10)} / ${formatWholeOrCentsCurrency(ready.finalCashP50)} / ${formatWholeOrCentsCurrency(ready.finalCashP90)}`,
                        ),
                    },
                    ...growthStatItems(summary),
                ]}
            />
        </div>
    );
}
