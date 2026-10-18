'use client';

import { type ReactNode } from 'react';

import { Badge } from '~/components/ui/badge';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { cn } from '~/lib/utilities';

export const WIZARD_CARD_CLASS = 'rounded-2xl border border-line px-4 py-3';

const CHOICE_CARD_CLASS =
    'h-auto w-full flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left whitespace-normal';

export interface ChoiceOption<T extends string> {
    hint?: ReactNode;
    label: ReactNode;
    value: T;
}

export function ChoiceCards<T extends string>({
    className,
    legend,
    onClear,
    onValueChange,
    options,
    value,
}: {
    className?: string;
    legend: string;
    onClear?: () => void;
    onValueChange: (value: T) => void;
    options: readonly ChoiceOption<T>[];
    value: null | T;
}) {
    return (
        <FieldSet>
            <FieldLegend variant="label">{legend}</FieldLegend>
            <ToggleGroup
                aria-label={legend}
                className={cn('grid grid-cols-2 gap-2', className)}
                onValueChange={(selected) => {
                    const option = options.find((o) => o.value === selected);
                    if (option) onValueChange(option.value);
                    else if (onClear) onClear();
                }}
                type="single"
                value={value ?? ''}
                variant="outline"
            >
                {options.map((option) => (
                    <ToggleGroupItem
                        className={CHOICE_CARD_CLASS}
                        key={option.value}
                        value={option.value}
                    >
                        <span className="text-sm">{option.label}</span>
                        {option.hint !== undefined && (
                            <span className="text-xs opacity-75">
                                {option.hint}
                            </span>
                        )}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </FieldSet>
    );
}

export function MultiChoiceCards<T extends string>({
    actions,
    className,
    legend,
    onValueChange,
    options,
    value,
}: {
    actions?: ReactNode;
    className?: string;
    legend: ReactNode;
    onValueChange: (value: T[]) => void;
    options: readonly ChoiceOption<T>[];
    value: readonly T[];
}) {
    return (
        <FieldSet>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLegend className="mb-0" variant="label">
                    {legend}
                </FieldLegend>
                {actions}
            </div>
            <ToggleGroup
                className={cn('grid grid-cols-2 gap-2', className)}
                onValueChange={(selected) =>
                    onValueChange(
                        options
                            .filter((o) => selected.includes(o.value))
                            .map((o) => o.value),
                    )
                }
                type="multiple"
                value={[...value]}
                variant="outline"
            >
                {options.map((option) => (
                    <ToggleGroupItem
                        className={CHOICE_CARD_CLASS}
                        key={option.value}
                        value={option.value}
                    >
                        <span className="text-sm">{option.label}</span>
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </FieldSet>
    );
}

export function SwitchCard({
    checked,
    description,
    flag,
    id,
    label,
    onCheckedChange,
}: {
    checked: boolean;
    description?: ReactNode;
    flag?: string;
    id: string;
    label: ReactNode;
    onCheckedChange: (checked: boolean) => void;
}) {
    const isFlagged = checked && flag !== undefined;
    return (
        <Field
            className={cn(
                WIZARD_CARD_CLASS,
                isFlagged && 'border-destructive/50',
            )}
            orientation="horizontal"
        >
            <Switch
                checked={checked}
                id={id}
                onCheckedChange={onCheckedChange}
            />
            <FieldContent>
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                {description !== undefined && (
                    <FieldDescription>{description}</FieldDescription>
                )}
            </FieldContent>
            {isFlagged && <Badge variant="destructive">{flag}</Badge>}
        </Field>
    );
}

export function NumberCard({
    description,
    id,
    label,
    onValueChange,
    step,
    value,
}: {
    description?: ReactNode;
    id: string;
    label: ReactNode;
    onValueChange: (value: number) => void;
    step: number;
    value: number;
}) {
    return (
        <Field className={cn(WIZARD_CARD_CLASS, 'gap-2')}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
                className="font-mono tabular-nums"
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                    const n = Number(event.target.value);
                    onValueChange(Number.isFinite(n) ? n : 0);
                }}
                step={step}
                type="number"
                value={Number.isFinite(value) ? value : ''}
            />
            {description !== undefined && (
                <FieldDescription>{description}</FieldDescription>
            )}
        </Field>
    );
}
