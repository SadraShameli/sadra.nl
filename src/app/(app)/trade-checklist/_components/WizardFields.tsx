'use client';

import {
    CircleCheck,
    CircleX,
    type LucideIcon,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode } from 'react';

import { Badge } from '~/components/ui/badge';
import { Checkbox } from '~/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
    FieldTitle,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
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

interface ToggleCardProperties {
    checked: boolean;
    description?: ReactNode;
    flag?: string;
    id: string;
    label: ReactNode;
    onCheckedChange: (isChecked: boolean) => void;
}

export function CheckboxCard({
    checked,
    onCheckedChange,
    ...card
}: ToggleCardProperties) {
    return (
        <ControlCard
            {...card}
            control={
                <Checkbox
                    checked={checked}
                    id={card.id}
                    onCheckedChange={(state) => onCheckedChange(state === true)}
                />
            }
            isChecked={checked}
        />
    );
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

export function SwitchCard({
    checked,
    onCheckedChange,
    ...card
}: ToggleCardProperties) {
    return (
        <ControlCard
            {...card}
            control={
                <Switch
                    checked={checked}
                    id={card.id}
                    onCheckedChange={onCheckedChange}
                />
            }
            isChecked={checked}
        />
    );
}

function ControlCard({
    control,
    description,
    flag,
    id,
    isChecked,
    label,
}: {
    control: ReactNode;
    description?: ReactNode;
    flag?: string;
    id: string;
    isChecked: boolean;
    label: ReactNode;
}) {
    const isFlagged = isChecked && flag !== undefined;
    return (
        <FieldLabel
            className={cn(
                'cursor-pointer rounded-2xl border-line transition-colors select-none hover:border-ink-muted/40 *:data-[slot=field]:px-4 *:data-[slot=field]:py-3',
                isFlagged &&
                    'has-data-[state=checked]:border-destructive/50 has-data-[state=checked]:bg-destructive/5 dark:has-data-[state=checked]:bg-destructive/10',
            )}
            htmlFor={id}
        >
            <Field orientation="horizontal">
                {control}
                <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    {description !== undefined && (
                        <FieldDescription>{description}</FieldDescription>
                    )}
                </FieldContent>
                {isFlagged && <Badge variant="destructive">{flag}</Badge>}
            </Field>
        </FieldLabel>
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
