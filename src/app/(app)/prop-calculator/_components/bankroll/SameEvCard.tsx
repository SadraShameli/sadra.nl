'use client';

import { useCallback, useState } from 'react';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    type SameEvOutcome,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { formatGateCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import { type Dollars } from '~/lib/prop-calculator';
import { BankrollLeverLabel } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import { bankrollSameEvRequest, bankrollVariantWithRisk } from './bankrollModel';
import { parseBankrollDollarsField } from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

const RISK_B_CONFLICT_MESSAGE_ID = 'bankroll-same-ev-risk-b-conflict';

export function SameEvCard() {
    const { variant: variantA } = useBankrollVariant();

    const [riskB, setRiskB] = useState<Dollars | null>(null);
    const [bankroll, setBankroll] = useState<Dollars | null>(null);

    const variantB = riskB === null ? null : bankrollVariantWithRisk(variantA, riskB);

    const canRun = variantB !== null && bankroll !== null;
    const requestKey = canRun ? stableJson({ bankroll, variantA, variantB }) : null;

    const buildRequest = useCallback(
        (runId: number) =>
            variantB === null || bankroll === null
                ? null
                : bankrollSameEvRequest([variantA, variantB], bankroll, runId),
        [bankroll, variantA, variantB],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const results =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.SameEv
            ? worker.state.result.results
            : null;
    const failureReason =
        canRun && worker.state.phase === ToolsWorkerPhase.Failed ? worker.state.reason : null;

    return (
        <section aria-labelledby="bankroll-same-ev-heading" className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-white" id="bankroll-same-ev-heading">
                Same EV, different risk
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-same-ev-bankroll">
                        Bankroll ($)
                    </label>
                    <Input
                        id="bankroll-same-ev-bankroll"
                        inputMode="decimal"
                        onChange={(event) => setBankroll(parseBankrollDollarsField(event.target.value))}
                        placeholder="Enter your bankroll"
                        type="number"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-same-ev-risk-b">
                        Strategy B risk per trade ($)
                    </label>
                    <Input
                        aria-describedby={riskB === null ? undefined : RISK_B_CONFLICT_MESSAGE_ID}
                        id="bankroll-same-ev-risk-b"
                        inputMode="decimal"
                        onChange={(event) => setRiskB(parseBankrollDollarsField(event.target.value))}
                        placeholder="e.g. 500"
                        type="number"
                    />
                </div>
            </div>
            {riskB === null ? null : (
                <p className="text-xs text-amber-400" id={RISK_B_CONFLICT_MESSAGE_ID}>
                    Strategy B: {BankrollLeverLabel.ConflictsWithHardRule3}
                </p>
            )}
            {results === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">{failureReason}</p>
                )
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <StrategyOutcomeColumn label="A" outcome={results[0]} />
                    <StrategyOutcomeColumn label="B" outcome={results[1]} />
                </div>
            )}
        </section>
    );
}

function StrategyOutcomeColumn({
    label,
    outcome,
}: {
    label: string;
    outcome: SameEvOutcome;
}) {
    return (
        <div className="grid gap-3">
            <p className="text-xs font-medium text-muted-foreground">Strategy {label}</p>
            <StatCard label="EV per attempt" value={formatGateCurrency(outcome.evPerAttempt)} />
            <StatCard
                label="P(no payout)"
                value={
                    outcome.noPayoutProbability === null
                        ? NOT_APPLICABLE
                        : formatPercent(outcome.noPayoutProbability)
                }
            />
            <StatCard
                label="Loss risk at the budget"
                value={outcome.lossRisk === null ? NOT_APPLICABLE : formatPercent(outcome.lossRisk)}
            />
        </div>
    );
}
