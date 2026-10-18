'use client';

import { Check } from 'lucide-react';
import { type ReactNode, useId } from 'react';

import { CheckboxCard } from '~/components/ToggleCard';
import {
    Field,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '~/components/ui/field';
import { Input, NUMBER_INPUT_CLASS } from '~/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { cn } from '~/lib/utilities';

export const WIZARD_CARD_CLASS = 'rounded-md border border-line px-4 py-3';

const CHOICE_CARD_CLASS =
    'h-full w-full flex-col items-start gap-0.5 rounded-md px-4 py-3 text-left whitespace-normal';

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
                    <div className="relative" key={option.value}>
                        <ToggleGroupItem
                            className={CHOICE_CARD_CLASS}
                            value={option.value}
                        >
                            <span className="text-sm">{option.label}</span>
                            {option.hint !== undefined && (
                                <span className="text-xs opacity-75">
                                    {option.hint}
                                </span>
                            )}
                        </ToggleGroupItem>
                        {option.value === value && (
                            <span
                                aria-hidden
                                className="pointer-events-none absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                            >
                                <Check className="size-3" strokeWidth={3} />
                            </span>
                        )}
                    </div>
                ))}
            </ToggleGroup>
        </FieldSet>
    );
}

export function MultiChoiceCards<T extends string>({
    actions,
    className,
    description,
    legend,
    onValueChange,
    options,
    value,
}: {
    actions?: ReactNode;
    className?: string;
    description?: ReactNode;
    legend: ReactNode;
    onValueChange: (value: T[]) => void;
    options: readonly ChoiceOption<T>[];
    value: readonly T[];
}) {
    const idPrefix = useId();
    return (
        <FieldSet>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLegend className="mb-0" variant="label">
                    {legend}
                </FieldLegend>
                {actions}
            </div>
            {description !== undefined && (
                <FieldDescription>{description}</FieldDescription>
            )}
            <div className={cn('grid grid-cols-2 gap-2', className)}>
                {options.map((option, index) => (
                    <CheckboxCard
                        checked={value.includes(option.value)}
                        description={option.hint}
                        id={`${idPrefix}-${String(index)}`}
                        key={option.value}
                        label={option.label}
                        onCheckedChange={(isChecked) =>
                            onValueChange(
                                options
                                    .filter((candidate) =>
                                        candidate.value === option.value
                                            ? isChecked
                                            : value.includes(candidate.value),
                                    )
                                    .map((candidate) => candidate.value),
                            )
                        }
                    />
                ))}
            </div>
        </FieldSet>
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
                className={cn(NUMBER_INPUT_CLASS, 'font-mono')}
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
