'use client';

import { useCallback, useMemo, useState } from 'react';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { formatGateCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import { type Dollars } from '~/lib/prop-calculator';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import {
    type BankrollLeverCandidates,
    bankrollLeversRequest,
    parseBankrollCandidateList,
    parseBankrollDollarCandidateList,
} from './bankrollModel';
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
    const requestKey = canRun ? stableJson({ bankroll, candidates, variant }) : null;

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
    const failureReason =
        canRun && worker.state.phase === ToolsWorkerPhase.Failed ? worker.state.reason : null;

    return (
        <section aria-labelledby="bankroll-levers-heading" className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-white" id="bankroll-levers-heading">
                Levers
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-levers-bankroll">
                        Bankroll ($)
                    </label>
                    <Input
                        id="bankroll-levers-bankroll"
                        inputMode="decimal"
                        onChange={(event) => setBankroll(parseBankrollDollarsField(event.target.value))}
                        placeholder="Enter your bankroll"
                        type="number"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-levers-risks">
                        Risk candidates ($, comma-separated)
                    </label>
                    <Input
                        id="bankroll-levers-risks"
                        onChange={(event) => setRisksText(event.target.value)}
                        placeholder="e.g. 200, 300"
                        value={risksText}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-levers-trades-per-day">
                        Trades/day candidates (comma-separated)
                    </label>
                    <Input
                        id="bankroll-levers-trades-per-day"
                        onChange={(event) => setTradesPerDayText(event.target.value)}
                        placeholder="e.g. 1, 2"
                        value={tradesPerDayText}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="bankroll-levers-request-sizes">
                        Payout request candidates ($, comma-separated)
                    </label>
                    <Input
                        id="bankroll-levers-request-sizes"
                        onChange={(event) => setRequestSizesText(event.target.value)}
                        placeholder="e.g. 500, 1000"
                        value={requestSizesText}
                    />
                </div>
            </div>
            {rows === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">{failureReason}</p>
                )
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="py-1 pr-3">Lever</th>
                                <th className="py-1 pr-3">Value</th>
                                <th className="py-1 pr-3">Δ EV/attempt</th>
                                <th className="py-1 pr-3">Δ Monthly net</th>
                                <th className="py-1 pr-3">Δ P(pass)</th>
                                <th className="py-1 pr-3">Δ P(pays)</th>
                                <th className="py-1 pr-3">Loss risk</th>
                                <th className="py-1 pr-3">Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr className="border-t border-white/10" key={`${row.kind}-${String(index)}`}>
                                    <td className="py-1 pr-3">{LEVER_KIND_LABEL[row.kind]}</td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatLeverValue(row.kind, row.value)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(row.deltaEvPerAttempt)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(row.deltaMonthlyNet)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatPercent(row.deltaPassProbability)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {row.deltaAttemptPaysProbability === undefined
                                            ? NOT_APPLICABLE
                                            : formatPercent(row.deltaAttemptPaysProbability)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {row.lossRisk === null ? NOT_APPLICABLE : formatPercent(row.lossRisk)}
                                    </td>
                                    <td className="py-1 pr-3 text-amber-400">{row.label ?? ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function formatLeverValue(kind: BankrollLeverKind, value: null | number): string {
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
