'use client';

import { useCallback, useMemo, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Badge } from '~/components/ui/Badge';
import { Field, FieldLabel } from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Lever</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Δ EV/attempt</TableHead>
                            <TableHead>Δ Monthly net</TableHead>
                            <TableHead>Δ P(pass)</TableHead>
                            <TableHead>Δ P(pays)</TableHead>
                            <TableHead>Loss risk</TableHead>
                            <TableHead>Δ Loss risk</TableHead>
                            <TableHead>Note</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, index) => (
                            <TableRow key={`${row.kind}-${String(index)}`}>
                                <TableCell>
                                    {LEVER_KIND_LABEL[row.kind]}
                                </TableCell>
                                <TableCell className="font-mono">
                                    {formatLeverValue(row.kind, row.value)}
                                </TableCell>
                                <TableCell className="font-mono">
                                    {formatGateCurrency(row.deltaEvPerAttempt)}
                                </TableCell>
                                <TableCell className="font-mono">
                                    {formatGateCurrency(row.deltaMonthlyNet)}
                                </TableCell>
                                <TableCell className="font-mono">
                                    {
                                        formatDelta(
                                            row.deltaPassProbability,
                                            0,
                                            'percent',
                                        ).text
                                    }
                                </TableCell>
                                <TableCell className="font-mono">
                                    {row.deltaAttemptPaysProbability ===
                                    undefined
                                        ? NOT_APPLICABLE
                                        : formatDelta(
                                              row.deltaAttemptPaysProbability,
                                              0,
                                              'percent',
                                          ).text}
                                </TableCell>
                                <TableCell className="font-mono">
                                    {row.lossRisk === null
                                        ? NOT_APPLICABLE
                                        : formatPercent(row.lossRisk)}
                                </TableCell>
                                <TableCell className="font-mono">
                                    {row.deltaLossProbability === null
                                        ? NOT_APPLICABLE
                                        : formatDelta(
                                              row.deltaLossProbability,
                                              0,
                                              'percent',
                                          ).text}
                                </TableCell>
                                <TableCell>
                                    {row.label === null ? null : (
                                        <Badge variant="warning">
                                            {row.label}
                                        </Badge>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
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
