'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import {
    formatConjunctionList,
    formatCurrency,
    formatGateCurrency,
} from '~/lib/format';
import {
    type InstrumentSymbol,
    type Plan,
    type TierProfitContext,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type RiskDisplayUnit,
    RungPlacement,
} from '~/lib/prop-calculator/advisor';

import { type DailyPlanCardViewModel } from './adviceViewModel';
import { contractsSizingOf } from './contractsSizingModel';
import { InstrumentStopEntry } from './InstrumentStopEntry';

export interface DailyCardEntry {
    readonly instrument: InstrumentSymbol;
    readonly isSettled: boolean;
    readonly onInstrumentChange: (instrument: InstrumentSymbol) => void;
    readonly onStopInputChange: (text: string) => void;
    readonly stopInput: string;
    readonly stopPoints: null | number;
}

export interface DailyCardSizing {
    readonly cushionLeft?: null | number;
    readonly dailyLossRoom?: null | number;
    readonly entry: DailyCardEntry;
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly tierContext: null | TierProfitContext;
    readonly unit: RiskDisplayUnit;
}

export function DailyPlanCardView({
    card,
    sizing = null,
    stopText = null,
}: {
    readonly card: DailyPlanCardViewModel;
    readonly sizing?: DailyCardSizing | null;
    readonly stopText?: null | string;
}) {
    const isStopSettled = sizing === null || sizing.entry.isSettled;
    const unplacedTrades = card.rungPlacements.flatMap((placement, index) =>
        placement === RungPlacement.BelowOneContract ? [index + 1] : [],
    );
    return (
        <div className="flex flex-col gap-2">
            {card.rungs.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock aria-hidden="true" className="size-4" />
                    No trade is placeable today.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Trade</TableHead>
                            <TableHead className="text-right">Risk</TableHead>
                            <TableHead className="text-right">
                                Take profit
                            </TableHead>
                            <TableHead className="text-right">
                                Running loss after
                            </TableHead>
                            <TableHead>Capped by</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {card.rungs.map((rung, index) => (
                            <TableRow key={String(index)}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(rung.risk, 2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(rung.takeProfit, 2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(rung.runningLossAfter, 2)}
                                </TableCell>
                                <TableCell>
                                    {rung.cappedByText.join(', ')}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="text-sm">
                {card.stopReasonText}
                {card.stopCappedByText.length > 0 &&
                    ` (${card.stopCappedByText.join(', ')})`}
            </p>
            {stopText !== null && (
                <p className="flex items-center gap-2 text-sm font-medium">
                    <Lock aria-hidden="true" className="size-4" />
                    Stop for today: {stopText}
                </p>
            )}
            {card.valueNow !== null &&
                card.valueAfterWin !== null &&
                card.valueAfterLoss !== null && (
                    <p className="text-sm">
                        Value now {formatGateCurrency(card.valueNow)}; after a
                        win {formatGateCurrency(card.valueAfterWin)}; after a
                        loss {formatGateCurrency(card.valueAfterLoss)}{' '}
                        (credit-free expected cash, if the next trade is taken
                        at the first rung).
                    </p>
                )}
            {isStopSettled && unplacedTrades.length > 0 && (
                <p className="text-sm font-medium text-amber-400">
                    {unplacedTrades.length === 1 ? 'Trade' : 'Trades'}{' '}
                    {formatConjunctionList(unplacedTrades.map(String))} cannot
                    be placed: below one contract at this stop
                    {card.oneContractRisk !== null &&
                        `, where one contract risks ${formatCurrency(card.oneContractRisk, 2)}`}
                    .
                </p>
            )}
            {sizing !== null &&
                sizing.phase === TradingPhase.Eval &&
                sizing.entry.stopPoints !== null &&
                card.rungPlacements.includes(RungPlacement.NotChecked) && (
                    <p className="text-sm text-muted-foreground">
                        Placement at the entered stop is not checked for
                        evaluation accounts, so a trade above may still be below
                        one contract.
                    </p>
                )}
            {sizing !== null && card.rungs[0] !== undefined && (
                <ContractsSizing risk={card.rungs[0].risk} sizing={sizing} />
            )}
        </div>
    );
}

function ContractsSizing({
    risk,
    sizing,
}: {
    readonly risk: number;
    readonly sizing: DailyCardSizing;
}) {
    const {
        instrument,
        isSettled,
        onInstrumentChange,
        onStopInputChange,
        stopInput,
        stopPoints,
    } = sizing.entry;
    const cushionLeft = sizing.cushionLeft ?? null;
    const dailyLossRoom = sizing.dailyLossRoom ?? null;
    const result = useMemo(
        () =>
            contractsSizingOf({
                cushionLeft,
                dailyLossRoom,
                instrument,
                phase: sizing.phase,
                plan: sizing.plan,
                risk,
                stopPoints,
                tierContext: sizing.tierContext,
                unit: sizing.unit,
            }),
        [
            cushionLeft,
            dailyLossRoom,
            instrument,
            risk,
            sizing.phase,
            sizing.plan,
            sizing.tierContext,
            sizing.unit,
            stopPoints,
        ],
    );
    return (
        <div className="flex flex-col gap-2">
            <InstrumentStopEntry
                instrument={instrument}
                instrumentId="daily-card-instrument"
                onInstrumentChange={onInstrumentChange}
                onStopInputChange={onStopInputChange}
                stopId="daily-card-stop"
                stopInput={stopInput}
            >
                <Link
                    className="text-sm underline"
                    href={result.href}
                    prefetch={false}
                >
                    Size in contracts
                </Link>
            </InstrumentStopEntry>
            {isSettled && result.inline !== null && (
                <div className="flex flex-col gap-1 text-sm">
                    <p>{result.inline.statusText}</p>
                    {result.inline.siblingText !== null && (
                        <p>{result.inline.siblingText}</p>
                    )}
                    {result.inline.siblingSeverityText !== null && (
                        <p className="text-amber-400">
                            {result.inline.siblingSeverityText}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
