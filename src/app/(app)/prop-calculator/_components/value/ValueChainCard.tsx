'use client';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { InfoNote } from '~/components/InfoNote';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Skeleton } from '~/components/ui/skeleton';
import {
    assumptionText,
    liveTransferAssumptionLines,
} from '~/lib/prop-calculator/advisor';
import { VALUE_CHAIN_STEP_LABEL } from '~/lib/prop-calculator/advisor/value';
import { stableJson } from '~/lib/stableJson';

import {
    signedCurrencyText,
    toolsWorkerCancelledText,
    toolsWorkerFailureReason,
    uncertainCurrencyText,
    type ValueCardsInput,
    ValueCardsInputKind,
    valueChainCardFailures,
    valueChainCardSteps,
    valueChainToolsRequest,
} from './valueCardsModel';
import { stepAssumptionsHeading } from './valueChainStepLabels';

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
    const cancelledText =
        refusal === null ? toolsWorkerCancelledText(worker.state) : null;
    const isComputing =
        refusal === null && worker.state.phase === ToolsWorkerPhase.Running;

    return (
        <section aria-labelledby="value-chain-heading">
            <ToolPanel
                info={
                    result === null ? undefined : (
                        <ValueChainAssumptions cardSteps={cardSteps} />
                    )
                }
                isComputing={isComputing}
                title="Value chain"
                titleAs="h3"
                titleId="value-chain-heading"
            >
                <div aria-live="polite" className="flex flex-col gap-4">
                    {failureReason === null ? null : (
                        <Alert variant="destructive">
                            <AlertDescription>{failureReason}</AlertDescription>
                        </Alert>
                    )}
                    {cancelledText === null ? null : (
                        <InfoNote>{cancelledText}</InfoNote>
                    )}
                    {isComputing && result === null ? (
                        <Skeleton className="h-24 w-full rounded-lg" />
                    ) : null}
                    {stepFailures.map((failure) => (
                        <Alert key={failure.kind} variant="destructive">
                            <AlertDescription>{failure.text}</AlertDescription>
                        </Alert>
                    ))}
                    {result === null ? null : (
                        <StatStrip
                            items={cardSteps.map((step) => ({
                                caption: [
                                    step.gapFromPrevious === null
                                        ? null
                                        : `${signedCurrencyText(step.gapFromPrevious.value)} from the previous step`,
                                    `credit-free; with end-of-horizon credit ${uncertainCurrencyText(step.creditInclusive)}`,
                                ]
                                    .filter((line) => line !== null)
                                    .join(' · '),
                                id: step.kind,
                                label: VALUE_CHAIN_STEP_LABEL[step.kind],
                                value: uncertainCurrencyText(step.creditFree),
                            }))}
                        />
                    )}
                </div>
            </ToolPanel>
        </section>
    );
}

function ValueChainAssumptions({
    cardSteps,
}: {
    cardSteps: ReturnType<typeof valueChainCardSteps>;
}) {
    return (
        <div className="flex flex-col gap-3">
            <p>
                Expected credit-free cash from each state under the documented
                policy, with the value including the end-of-horizon credit
                beside it. A gap is the credit-free value minus the previous
                built step&apos;s, with the two standard errors combined in
                quadrature.
            </p>
            {cardSteps.map((step) =>
                step.liveTransfer === undefined ? null : (
                    <div className="flex flex-col gap-1" key={step.kind}>
                        <PanelSubheading as="h4">
                            {VALUE_CHAIN_STEP_LABEL[step.kind]} hazard
                        </PanelSubheading>
                        <ul
                            aria-label={`Live-transfer and payout-trigger assumptions behind the ${VALUE_CHAIN_STEP_LABEL[step.kind]} value`}
                            className="flex flex-col gap-1"
                        >
                            {liveTransferAssumptionLines(step.liveTransfer).map(
                                (line) => (
                                    <li key={line}>{line}</li>
                                ),
                            )}
                        </ul>
                    </div>
                ),
            )}
            {cardSteps.map((step) =>
                step.cumulativePayoutTrigger === undefined ? null : (
                    <div className="flex flex-col gap-1" key={step.kind}>
                        <PanelSubheading as="h4">
                            {VALUE_CHAIN_STEP_LABEL[step.kind]} cumulative
                            payout trigger
                        </PanelSubheading>
                        <ul
                            aria-label={`Cumulative payout trigger behind the ${VALUE_CHAIN_STEP_LABEL[step.kind]} value`}
                            className="flex flex-col gap-1"
                        >
                            <li>
                                {assumptionText(step.cumulativePayoutTrigger)}
                            </li>
                        </ul>
                    </div>
                ),
            )}
            {cardSteps
                .filter((step) => step.assumptions.length > 0)
                .map((step) => (
                    <div className="flex flex-col gap-1" key={step.kind}>
                        <PanelSubheading as="h4">
                            {stepAssumptionsHeading(step.kind)}
                        </PanelSubheading>
                        <ul
                            aria-label={stepAssumptionsHeading(step.kind)}
                            className="list-disc pl-4"
                        >
                            {step.assumptions.map((assumption) => (
                                <li key={assumption}>{assumption}</li>
                            ))}
                        </ul>
                    </div>
                ))}
        </div>
    );
}
