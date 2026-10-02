'use client';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { stableJson } from '~/lib/stableJson';

import {
    signedCurrencyText,
    toolsWorkerFailureReason,
    toolsWorkerPendingText,
    uncertainCurrencyText,
    type ValueCardsInput,
    ValueCardsInputKind,
    valueChainCardFailures,
    valueChainCardSteps,
    valueChainToolsRequest,
} from './valueCardsModel';
import {
    stepAssumptionsHeading,
    VALUE_CHAIN_STEP_LABEL,
} from './valueChainStepLabels';

export function ValueChainCard({ cards }: { cards: ValueCardsInput }) {
    const settledInput = useDebouncedValue(cards, SIM_DEBOUNCE_MS);
    const settledCards =
        settledInput.kind === ValueCardsInputKind.Ready
            ? settledInput.cards
            : null;
    const worker = useToolsRequest(
        settledCards === null ? null : stableJson(settledCards),
        (runId) =>
            settledCards === null
                ? null
                : valueChainToolsRequest(settledCards, runId),
    );

    const refusal =
        cards.kind === ValueCardsInputKind.Refused ? cards.reason : null;
    const result =
        refusal === null &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.ValueChain
            ? worker.state.result.result
            : null;
    const cardSteps = result === null ? [] : valueChainCardSteps(result);
    const stepFailures = result === null ? [] : valueChainCardFailures(result);
    const failureReason = refusal ?? toolsWorkerFailureReason(worker.state);
    const pendingText =
        refusal === null ? toolsWorkerPendingText(worker.state) : null;

    return (
        <section
            aria-busy={
                refusal === null &&
                worker.state.phase === ToolsWorkerPhase.Running
            }
            aria-labelledby="value-chain-heading"
            className="flex flex-col gap-4"
        >
            <h3
                className="text-base font-semibold text-white"
                id="value-chain-heading"
            >
                Value chain
            </h3>
            <div aria-live="polite" className="flex flex-col gap-4">
                {failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )}
                {pendingText === null ? null : (
                    <p className="text-xs text-muted-foreground">
                        {pendingText}
                    </p>
                )}
                {stepFailures.map((failure) => (
                    <p
                        className="text-xs text-rose-400"
                        key={failure.kind}
                        role="alert"
                    >
                        {failure.text}
                    </p>
                ))}
                {result === null ? null : (
                    <>
                        <p className="text-xs text-muted-foreground">
                            Expected credit-free cash from each state under the
                            documented policy, with the value including the
                            end-of-horizon credit beside it. A gap is the
                            credit-free value minus the previous built step's,
                            with the two standard errors combined in quadrature.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {cardSteps.map((step) => (
                                <StatCard
                                    key={step.kind}
                                    label={VALUE_CHAIN_STEP_LABEL[step.kind]}
                                    sub={[
                                        step.gapFromPrevious === null
                                            ? null
                                            : `${signedCurrencyText(step.gapFromPrevious.value)} from the previous step`,
                                        `credit-free; with end-of-horizon credit ${uncertainCurrencyText(step.creditInclusive)}`,
                                    ]
                                        .filter((line) => line !== null)
                                        .join(' · ')}
                                    value={uncertainCurrencyText(
                                        step.creditFree,
                                    )}
                                />
                            ))}
                        </div>
                        {cardSteps
                            .filter((step) => step.assumptions.length > 0)
                            .map((step) => (
                                <div
                                    className="flex flex-col gap-1"
                                    key={step.kind}
                                >
                                    <h4 className="text-xs font-semibold text-white">
                                        {stepAssumptionsHeading(step.kind)}
                                    </h4>
                                    <ul
                                        aria-label={stepAssumptionsHeading(
                                            step.kind,
                                        )}
                                        className="list-disc pl-4 text-xs text-muted-foreground"
                                    >
                                        {step.assumptions.map((assumption) => (
                                            <li key={assumption}>
                                                {assumption}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                    </>
                )}
            </div>
        </section>
    );
}
