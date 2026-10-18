'use client';

import {
    CircleCheck,
    CircleX,
    type LucideIcon,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode } from 'react';

import {
    Field,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { cn } from '~/lib/utilities';

export const WIZARD_CARD_CLASS = 'rounded-2xl border border-line px-4 py-3';

const CHOICE_CARD_CLASS =
    'h-auto w-full flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left whitespace-normal';

export enum StatusTone {
    Fail = 'fail',
    Pass = 'pass',
    Warn = 'warn',
}

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

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
    [StatusTone.Fail]: 'bg-destructive/15 text-destructive',
    [StatusTone.Pass]: 'bg-success/15 text-success',
    [StatusTone.Warn]: 'bg-warning/15 text-warning',
};

const STATUS_METER_CLASS: Record<StatusTone, string> = {
    [StatusTone.Fail]: 'bg-destructive',
    [StatusTone.Pass]: 'bg-success',
    [StatusTone.Warn]: 'bg-warning',
};

const STATUS_ICON: Record<StatusTone, LucideIcon> = {
    [StatusTone.Fail]: CircleX,
    [StatusTone.Pass]: CircleCheck,
    [StatusTone.Warn]: TriangleAlert,
};

export function StatusRow({
    detail,
    meter,
    title,
    tone,
    value,
}: {
    detail?: ReactNode;
    meter?: { filled: number; total: number };
    title: ReactNode;
    tone: StatusTone;
    value?: ReactNode;
}) {
    const Icon = STATUS_ICON[tone];
    return (
        <div
            className={cn(WIZARD_CARD_CLASS, 'flex flex-col gap-3')}
            role="status"
        >
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        STATUS_TONE_CLASS[tone],
                    )}
                >
                    <Icon aria-hidden className="size-4.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="m-0 text-sm font-medium text-foreground">
                        {title}
                    </p>
                    {detail !== undefined && (
                        <p className="m-0 text-xs text-muted-foreground">
                            {detail}
                        </p>
                    )}
                </div>
                {value !== undefined && (
                    <span className="font-mono text-lg text-foreground tabular-nums">
                        {value}
                    </span>
                )}
            </div>
            {meter !== undefined && (
                <div aria-hidden className="flex gap-1">
                    {Array.from({ length: meter.total }, (_, index) => (
                        <span
                            className={cn(
                                'h-1.5 flex-1 rounded-full bg-muted',
                                index < meter.filled &&
                                    STATUS_METER_CLASS[tone],
                            )}
                            key={index}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
