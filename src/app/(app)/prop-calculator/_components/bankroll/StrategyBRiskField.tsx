'use client';

import { FieldDescription } from '~/components/ui/field';
import { WarningNote } from '~/components/WarningNote';
import { type Dollars } from '~/lib/prop-calculator';
import { BankrollLeverLabel } from '~/lib/prop-calculator/economics';

import { BankrollField } from './BankrollField';
import { parseBankrollDollarsField } from './bankrollUrlState';

interface StrategyBRiskFieldProperties {
    readonly conflictId: string;
    readonly id: string;
    readonly onChange: (risk: Dollars | null) => void;
    readonly risk: Dollars | null;
}

export function StrategyBRiskField({
    conflictId,
    id,
    onChange,
    risk,
}: StrategyBRiskFieldProperties) {
    return (
        <BankrollField
            describedBy={risk === null ? undefined : conflictId}
            id={id}
            info="Risk per trade for strategy B, in dollars. Strategy A keeps the risk set in the calculator."
            label="Strategy B risk"
            onChange={(raw) => onChange(parseBankrollDollarsField(raw))}
            placeholder="e.g. 500"
        >
            {risk === null ? null : (
                <FieldDescription className="text-xs" id={conflictId}>
                    <WarningNote>
                        Strategy B: {BankrollLeverLabel.ConflictsWithHardRule3}
                    </WarningNote>
                </FieldDescription>
            )}
        </BankrollField>
    );
}
