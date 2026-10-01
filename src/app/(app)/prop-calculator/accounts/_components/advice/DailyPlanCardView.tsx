'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CALCULATOR_FIELD_LABELS } from '~/app/(app)/prop-calculator/_components/calculatorFieldLabels';
import { POSITION_SIZE_INSTRUMENTS } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import {
    parsePositionSizeInstrument,
    parsePositionSizeStop,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { formatCurrency, formatGateCurrency } from '~/lib/format';
import {
    InstrumentSymbol,
    type Plan,
    type TierProfitContext,
    type TradingPhase,
} from '~/lib/prop-calculator';
import { type RiskDisplayUnit } from '~/lib/prop-calculator/advisor';

import { type DailyPlanCardViewModel } from './adviceViewModel';
import { contractsSizingOf } from './contractsSizingModel';

export interface DailyCardSizing {
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly tierContext: null | TierProfitContext;
    readonly unit: RiskDisplayUnit;
}

const DEFAULT_INSTRUMENT = InstrumentSymbol.NQ;

export function DailyPlanCardView({
    card,
    sizing = null,
    stopText = null,
}: {
    readonly card: DailyPlanCardViewModel;
    readonly sizing?: DailyCardSizing | null;
    readonly stopText?: null | string;
}) {
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
                        loss {formatGateCurrency(card.valueAfterLoss)} (credit-free
                        expected cash, if the next trade is taken at the first
                        rung).
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
    const [instrument, setInstrument] = useState(DEFAULT_INSTRUMENT);
    const [stopText, setStopText] = useState('');
    const stopPoints = parsePositionSizeStop(stopText);
    const result = useMemo(
        () =>
            contractsSizingOf({
                instrument,
                phase: sizing.phase,
                plan: sizing.plan,
                risk,
                stopPoints,
                tierContext: sizing.tierContext,
                unit: sizing.unit,
            }),
        [
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
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="daily-card-instrument">Instrument</Label>
                    <Select
                        onValueChange={(value) => {
                            const next = parsePositionSizeInstrument(value);
                            if (next !== null) setInstrument(next);
                        }}
                        value={instrument}
                    >
                        <SelectTrigger id="daily-card-instrument">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {POSITION_SIZE_INSTRUMENTS.map((spec) => (
                                <SelectItem key={spec.symbol} value={spec.symbol}>
                                    {spec.symbol}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="daily-card-stop">{CALCULATOR_FIELD_LABELS.stopPoints}</Label>
                    <Input
                        className="w-32"
                        id="daily-card-stop"
                        inputMode="decimal"
                        onChange={(event) => {
                            setStopText(event.target.value);
                        }}
                        value={stopText}
                    />
                </div>
                <Link className="text-sm underline" href={result.href} prefetch={false}>
                    Size in contracts
                </Link>
            </div>
            {result.inline !== null && (
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
