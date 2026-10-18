'use client';

import { useCallback, useMemo, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Badge } from '~/components/ui/badge';
import { DataTable } from '~/components/ui/data-table';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    formatDelta,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { type Dollars } from '~/lib/prop-calculator';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import {
    type BankrollLeverCandidates,
    bankrollLeversRequest,
    parseBankrollCandidateList,
    parseBankrollDollarCandidateList,
} from './bankrollModel';
import { BankrollRunStatus } from './BankrollRunStatus';
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
            description="Tries each candidate risk, trades per day and payout request against your current setup and shows how much each one moves the results."
            headingId="bankroll-levers-heading"
            title="Levers"
        >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field>
                    <FieldLabel htmlFor="bankroll-levers-bankroll">
                        Bankroll ($)
                    </FieldLabel>
                    <Input
                        id="bankroll-levers-bankroll"
                        inputMode="decimal"
                        onChange={(event) =>
                            setBankroll(
                                parseBankrollDollarsField(event.target.value),
                            )
                        }
                        placeholder="Enter your bankroll"
                        type="number"
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="bankroll-levers-risks">
                        Risk candidates ($, comma-separated)
                    </FieldLabel>
                    <Input
                        id="bankroll-levers-risks"
                        onChange={(event) => setRisksText(event.target.value)}
                        placeholder="e.g. 200, 300"
                        value={risksText}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="bankroll-levers-trades-per-day">
                        Trades/day candidates (comma-separated)
                    </FieldLabel>
                    <Input
                        id="bankroll-levers-trades-per-day"
                        onChange={(event) =>
                            setTradesPerDayText(event.target.value)
                        }
                        placeholder="e.g. 1, 2"
                        value={tradesPerDayText}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="bankroll-levers-request-sizes">
                        Payout request candidates ($, comma-separated)
                    </FieldLabel>
                    <Input
                        id="bankroll-levers-request-sizes"
                        onChange={(event) =>
                            setRequestSizesText(event.target.value)
                        }
                        placeholder="e.g. 500, 1000"
                        value={requestSizesText}
                    />
                </Field>
            </div>
            {rows === null ? (
                <BankrollRunStatus isRequested={canRun} state={worker.state} />
            ) : (
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
                                    {formatLeverValue(row.kind, row.value)}
                                </span>
                            ),
                            header: 'Value',
                            id: LeverColumn.Value,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <span className="font-mono">
                                    {formatGateCurrency(row.deltaEvPerAttempt)}
                                </span>
                            ),
                            header: 'Δ EV/attempt',
                            id: LeverColumn.DeltaEvPerAttempt,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <span className="font-mono">
                                    {formatGateCurrency(row.deltaMonthlyNet)}
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
                                    {row.deltaAttemptPaysProbability ===
                                    undefined
                                        ? NOT_APPLICABLE
                                        : formatDelta(
                                              row.deltaAttemptPaysProbability,
                                              0,
                                              'percent',
                                          ).text}
                                </span>
                            ),
                            header: 'Δ P(pays)',
                            id: LeverColumn.DeltaPaysProbability,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <span className="font-mono">
                                    {row.lossRisk === null
                                        ? NOT_APPLICABLE
                                        : formatPercent(row.lossRisk)}
                                </span>
                            ),
                            header: 'Loss risk',
                            id: LeverColumn.LossRisk,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <span className="font-mono">
                                    {row.deltaLossProbability === null
                                        ? NOT_APPLICABLE
                                        : formatDelta(
                                              row.deltaLossProbability,
                                              0,
                                              'percent',
                                          ).text}
                                </span>
                            ),
                            header: 'Δ Loss risk',
                            id: LeverColumn.DeltaLossRisk,
                        },
                        {
                            cell: ({ row: { original: row } }) =>
                                row.label === null ? null : (
                                    <Badge>{row.label}</Badge>
                                ),
                            header: 'Note',
                            id: LeverColumn.Note,
                        },
                    ]}
                    data={[...rows]}
                    isSortable={false}
                    pageSize={null}
                />
            )}
        </BankrollSection>
    );
}

function formatLeverValue(
    kind: BankrollLeverKind,
    value: null | number,
): string {
    if (value === null) return NOT_APPLICABLE;
    switch (kind) {
        case BankrollLeverKind.Base: {
            return String(value);
        }
        case BankrollLeverKind.RequestSize: {
            return formatGateCurrency(value);
        }
        case BankrollLeverKind.Risk: {
            return formatGateCurrency(value);
        }
        case BankrollLeverKind.TradesPerDay: {
            return String(value);
        }
    }
}
