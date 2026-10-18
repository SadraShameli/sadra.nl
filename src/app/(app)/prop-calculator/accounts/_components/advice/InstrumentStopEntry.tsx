'use client';

import { type ReactNode } from 'react';

import { CALCULATOR_FIELD_LABELS } from '~/app/(app)/prop-calculator/_components/calculatorFieldLabels';
import { POSITION_SIZE_INSTRUMENTS } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import { parsePositionSizeInstrument } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { InstrumentSymbol } from '~/lib/prop-calculator';

export const DEFAULT_ENTRY_INSTRUMENT = InstrumentSymbol.NQ;

export function InstrumentStopEntry({
    children,
    instrument,
    instrumentId,
    onInstrumentChange,
    onStopInputChange,
    stopId,
    stopInput,
}: {
    readonly children?: ReactNode;
    readonly instrument: InstrumentSymbol;
    readonly instrumentId: string;
    readonly onInstrumentChange: (instrument: InstrumentSymbol) => void;
    readonly onStopInputChange: (text: string) => void;
    readonly stopId: string;
    readonly stopInput: string;
}) {
    return (
        <div className="flex flex-wrap items-end gap-3">
            <Field className="w-auto">
                <FieldLabel htmlFor={instrumentId}>Instrument</FieldLabel>
                <Select
                    onValueChange={(value) => {
                        const next = parsePositionSizeInstrument(value);
                        if (next !== null) onInstrumentChange(next);
                    }}
                    value={instrument}
                >
                    <SelectTrigger id={instrumentId}>
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
            </Field>
            <Field className="w-auto">
                <FieldLabel htmlFor={stopId}>
                    {CALCULATOR_FIELD_LABELS.stopPoints}
                </FieldLabel>
                <Input
                    className="w-32"
                    id={stopId}
                    inputMode="decimal"
                    onChange={(event) => {
                        onStopInputChange(event.target.value);
                    }}
                    value={stopInput}
                />
            </Field>
            {children}
        </div>
    );
}
