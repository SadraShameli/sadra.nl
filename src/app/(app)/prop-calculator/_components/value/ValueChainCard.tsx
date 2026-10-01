'use client';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { ValueChainStepKind } from '~/lib/prop-calculator/advisor/value';
import { stableJson } from '~/lib/stableJson';

import {
    signedCurrencyText,
    toolsWorkerFailureReason,
    toolsWorkerPendingText,
    uncertainCurrencyText,
    type ValueCardsInput,
    ValueCardsInputKind,
    valueChainCardSteps,
    valueChainToolsRequest,
} from './valueCardsModel';

const VALUE_CHAIN_STEP_LABEL: Record<ValueChainStepKind, string> = {
    [ValueChainStepKind.EvalStart]: 'Eval start',
    [ValueChainStepKind.FirstPayoutEligible]: 'First payout eligible',
    [ValueChainStepKind.FreshFunded]: 'Fresh funded',
    [ValueChainStepKind.PostFirstPayout]: 'Post first payout',
};

export function ValueChainCard({ cards }: { cards: ValueCardsInput }) {
    const settledInput = useDebouncedValue(cards, SIM_DEBOUNCE_MS);
    const settledCards =
        settledInput.kind === ValueCardsInputKind.Ready ? settledInput.cards : null;
    const worker = useToolsRequest(
        settledCards === null ? null : stableJson(settledCards),
        (runId) =>
            settledCards === null ? null : valueChainToolsRequest(settledCards, runId),
    );

    const refusal = cards.kind === ValueCardsInputKind.Refused ? cards.reason : null;
    const result =
        refusal === null &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.ValueChain
            ? worker.state.result.result
            : null;
    const failureReason = refusal ?? toolsWorkerFailureReason(worker.state);
    const pendingText = refusal === null ? toolsWorkerPendingText(worker.state) : null;

    return (
        <section
            aria-busy={refusal === null && worker.state.phase === ToolsWorkerPhase.Running}
            aria-labelledby="value-chain-heading"
            className="flex flex-col gap-4"
        >
            <h3 className="text-base font-semibold text-white" id="value-chain-heading">
                Value chain
            </h3>
            <div aria-live="polite" className="flex flex-col gap-4">
                {failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )}
                {pendingText === null ? null : (
                    <p className="text-xs text-muted-foreground">{pendingText}</p>
                )}
                {result === null ? null : (
                    <>
                        <p className="text-xs text-muted-foreground">
                            Expected credit-free cash from each state, with the
                            value including the end-of-horizon credit beside it.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {valueChainCardSteps(result).map((step) => (
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
                                    value={uncertainCurrencyText(step.creditFree)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
