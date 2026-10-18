'use client';

import { useCallback, useMemo, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ValueOrMissing } from '~/app/(app)/prop-calculator/_components/ValueOrMissing';
import {
    type BankrollLeverRowSummary,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { MissingValue } from '~/components/MissingValue';
import { Badge } from '~/components/ui/badge';
import { DataTable } from '~/components/ui/data-table';
import {
    formatDelta,
    formatPercent,
    formatWholeOrCentsCurrency,
} from '~/lib/format';
import { type Dollars } from '~/lib/prop-calculator';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import { BankrollField, BankrollFieldKind } from './BankrollField';
import {
    type BankrollLeverCandidates,
    bankrollLeversRequest,
    parseBankrollCandidateList,
    parseBankrollDollarCandidateList,
} from './bankrollModel';
import {
    BankrollRunStatus,
    isAwaitingRequestedResult,
} from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { parseBankrollDollarsField } from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

enum LeverColumn {
    DeltaEvPerAttempt = 'delta-ev-per-attempt',
    DeltaLossRisk = 'delta-loss-risk',
    DeltaMonthlyNet = 'delta-monthly-net',
    DeltaPassProbability = 'delta-pass-probability',
    DeltaPaysProbability = 'delta-pays-probability',
    Lever = 'lever',
    LossRisk = 'loss-risk',
    Note = 'note',
    Value = 'value',
}

const LEVER_KIND_LABEL: Readonly<Record<BankrollLeverKind, string>> = {
    [BankrollLeverKind.Base]: 'Base',
    [BankrollLeverKind.RequestSize]: 'Payout request',
    [BankrollLeverKind.Risk]: 'Risk',
    [BankrollLeverKind.TradesPerDay]: 'Trades per day',
};

export function LeversCard() {
    const { variant } = useBankrollVariant();

    const [bankroll, setBankroll] = useState<Dollars | null>(null);
    const [risksText, setRisksText] = useState('');
    const [tradesPerDayText, setTradesPerDayText] = useState('');
    const [requestSizesText, setRequestSizesText] = useState('');

    const candidates: BankrollLeverCandidates = useMemo(
        () => ({
            requestSizes: parseBankrollDollarCandidateList(requestSizesText),
            risks: parseBankrollDollarCandidateList(risksText),
            tradesPerDay: parseBankrollCandidateList(tradesPerDayText),
        }),
        [requestSizesText, risksText, tradesPerDayText],
    );
    const hasCandidates =
        candidates.risks !== null ||
        candidates.tradesPerDay !== null ||
        candidates.requestSizes !== null;

    const canRun = bankroll !== null && hasCandidates;
    const requestKey = canRun
        ? stableJson({ bankroll, candidates, variant })
        : null;

    const buildRequest = useCallback(
        (runId: number) =>
            bankroll === null || !hasCandidates
                ? null
                : bankrollLeversRequest(variant, bankroll, candidates, runId),
        [bankroll, candidates, hasCandidates, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const rows =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.Levers
            ? worker.state.result.rows
            : null;

    return (
        <BankrollSection
            headingId="bankroll-levers-heading"
            info="Tries each candidate risk, trades per day and payout request against your current setup and shows how much each one moves the results."
            inputs={
                <>
                    <BankrollField
                        id="bankroll-levers-bankroll"
                        info="The bankroll the loss risk is measured at, in dollars."
                        label="Bankroll"
                        onChange={(raw) =>
                            setBankroll(parseBankrollDollarsField(raw))
                        }
                        placeholder="Enter your bankroll"
                    />
                    <BankrollField
                        id="bankroll-levers-risks"
                        info="Risk per trade values to try, in dollars, separated by commas."
                        kind={BankrollFieldKind.List}
                        label="Risk per trade"
                        onChange={setRisksText}
                        placeholder="e.g. 200, 300"
                    />
                    <BankrollField
                        id="bankroll-levers-trades-per-day"
                        info="Trades per day values to try, separated by commas."
                        kind={BankrollFieldKind.List}
                        label="Trades per day"
                        onChange={setTradesPerDayText}
                        placeholder="e.g. 1, 2"
                    />
                    <BankrollField
                        id="bankroll-levers-request-sizes"
                        info="Payout request sizes to try, in dollars, separated by commas."
                        kind={BankrollFieldKind.List}
                        label="Payout request"
                        onChange={setRequestSizesText}
                        placeholder="e.g. 500, 1000"
                    />
                </>
            }
            isComputing={isAwaitingRequestedResult(canRun, worker.state)}
            results={
                rows === null ? (
                    <BankrollRunStatus
                        emptyText="Enter a bankroll and at least one list of candidates to try."
                        isRequested={canRun}
                        skeleton={<LeversTable isLoading rows={[]} />}
                        state={worker.state}
                    />
                ) : (
                    <LeversTable isLoading={false} rows={rows} />
                )
            }
            title="Levers"
        />
    );
}

function formatLeverValue(
    kind: BankrollLeverKind,
    value: null | number,
): null | string {
    if (value === null) return null;
    switch (kind) {
        case BankrollLeverKind.Base: {
            return String(value);
        }
        case BankrollLeverKind.RequestSize: {
            return formatWholeOrCentsCurrency(value);
        }
        case BankrollLeverKind.Risk: {
            return formatWholeOrCentsCurrency(value);
        }
        case BankrollLeverKind.TradesPerDay: {
            return String(value);
        }
    }
}

function LeversTable({
    isLoading,
    rows,
}: {
    readonly isLoading: boolean;
    readonly rows: readonly BankrollLeverRowSummary[];
}) {
    return (
        <DataTable
            columns={[
                {
                    cell: ({ row: { original: row } }) =>
                        LEVER_KIND_LABEL[row.kind],
                    header: 'Lever',
                    id: LeverColumn.Lever,
                    meta: { isRowHeader: true },
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            <ValueOrMissing
                                value={formatLeverValue(row.kind, row.value)}
                            />
                        </span>
                    ),
                    header: 'Value',
                    id: LeverColumn.Value,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {formatWholeOrCentsCurrency(row.deltaEvPerAttempt)}
                        </span>
                    ),
                    header: 'Δ EV/attempt',
                    id: LeverColumn.DeltaEvPerAttempt,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {formatWholeOrCentsCurrency(row.deltaMonthlyNet)}
                        </span>
                    ),
                    header: 'Δ Monthly net',
                    id: LeverColumn.DeltaMonthlyNet,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {
                                formatDelta(
                                    row.deltaPassProbability,
                                    0,
                                    'percent',
                                ).text
                            }
                        </span>
                    ),
                    header: 'Δ P(pass)',
                    id: LeverColumn.DeltaPassProbability,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.deltaAttemptPaysProbability === undefined ? (
                                <MissingValue />
                            ) : (
                                formatDelta(
                                    row.deltaAttemptPaysProbability,
                                    0,
                                    'percent',
                                ).text
                            )}
                        </span>
                    ),
                    header: 'Δ P(pays)',
                    id: LeverColumn.DeltaPaysProbability,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.lossRisk === null ? (
                                <MissingValue />
                            ) : (
                                formatPercent(row.lossRisk)
                            )}
                        </span>
                    ),
                    header: 'Loss risk',
                    id: LeverColumn.LossRisk,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.deltaLossProbability === null ? (
                                <MissingValue />
                            ) : (
                                formatDelta(
                                    row.deltaLossProbability,
                                    0,
                                    'percent',
                                ).text
                            )}
                        </span>
                    ),
                    header: 'Δ Loss risk',
                    id: LeverColumn.DeltaLossRisk,
                },
                {
                    cell: ({ row: { original: row } }) =>
                        row.label === null ? null : <Badge>{row.label}</Badge>,
                    header: 'Note',
                    id: LeverColumn.Note,
                },
            ]}
            data={[...rows]}
            isLoading={isLoading}
            isSortable={false}
            pageSize={null}
        />
    );
}
