'use client';

import { useCallback, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    type SameEvOutcome,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { formatPercent, formatWholeOrCentsCurrency } from '~/lib/format';
import { type Dollars } from '~/lib/prop-calculator';
import { stableJson } from '~/lib/stableJson';

import { BankrollField } from './BankrollField';
import {
    bankrollSameEvRequest,
    bankrollVariantWithRisk,
} from './bankrollModel';
import {
    BankrollRunStatus,
    isAwaitingRequestedResult,
} from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { readyValue } from './bankrollStatItems';
import { parseBankrollDollarsField } from './bankrollUrlState';
import { StrategyBRiskField } from './StrategyBRiskField';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

const RISK_B_CONFLICT_MESSAGE_ID = 'bankroll-same-ev-risk-b-conflict';

export function SameEvCard() {
    const { variant: variantA } = useBankrollVariant();

    const [riskB, setRiskB] = useState<Dollars | null>(null);
    const [bankroll, setBankroll] = useState<Dollars | null>(null);

    const variantB =
        riskB === null ? null : bankrollVariantWithRisk(variantA, riskB);

    const canRun = variantB !== null && bankroll !== null;
    const requestKey = canRun
        ? stableJson({ bankroll, variantA, variantB })
        : null;

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

    return (
        <BankrollSection
            headingId="bankroll-same-ev-heading"
            info="Two risk sizes can earn a similar expected value per attempt yet carry very different odds of losing the bankroll. Compare them at one bankroll."
            inputs={
                <>
                    <BankrollField
                        id="bankroll-same-ev-bankroll"
                        info="The bankroll both strategies spend from, in dollars. Loss risk is measured at this budget."
                        label="Bankroll"
                        onChange={(raw) =>
                            setBankroll(parseBankrollDollarsField(raw))
                        }
                        placeholder="Enter your bankroll"
                    />
                    <StrategyBRiskField
                        conflictId={RISK_B_CONFLICT_MESSAGE_ID}
                        id="bankroll-same-ev-risk-b"
                        onChange={setRiskB}
                        risk={riskB}
                    />
                </>
            }
            isComputing={isAwaitingRequestedResult(canRun, worker.state)}
            results={
                results === null ? (
                    <BankrollRunStatus
                        emptyText="Enter a bankroll and a strategy B risk to compare."
                        isRequested={canRun}
                        skeleton={
                            <>
                                <StrategyOutcome label="A" outcome={null} />
                                <StrategyOutcome label="B" outcome={null} />
                            </>
                        }
                        state={worker.state}
                    />
                ) : (
                    <>
                        <StrategyOutcome label="A" outcome={results[0]} />
                        <StrategyOutcome label="B" outcome={results[1]} />
                    </>
                )
            }
            title="Same EV, different risk"
        />
    );
}

function StrategyOutcome({
    label,
    outcome,
}: {
    readonly label: string;
    readonly outcome: null | SameEvOutcome;
}) {
    return (
        <div className="flex flex-col gap-3">
            <PanelSubheading>Strategy {label}</PanelSubheading>
            <StatStrip
                isLoading={outcome === null}
                items={[
                    {
                        id: 'ev-per-attempt',
                        label: 'EV per attempt',
                        value: readyValue(outcome, (ready) =>
                            formatWholeOrCentsCurrency(ready.evPerAttempt),
                        ),
                    },
                    {
                        id: 'no-payout',
                        label: 'P(no payout)',
                        value: readyValue(outcome, (ready) =>
                            ready.noPayoutProbability === null ? (
                                <MissingValue />
                            ) : (
                                formatPercent(ready.noPayoutProbability)
                            ),
                        ),
                    },
                    {
                        id: 'loss-risk',
                        label: 'Loss risk at the budget',
                        value: readyValue(outcome, (ready) =>
                            ready.lossRisk === null ? (
                                <MissingValue />
                            ) : (
                                formatPercent(ready.lossRisk)
                            ),
                        ),
                    },
                ]}
            />
        </div>
    );
}
