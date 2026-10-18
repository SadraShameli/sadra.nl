'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ProfileFormFooter } from '~/app/(app)/profile/_components/ProfileFormFooter';
import { PanelSubheading } from '~/components/PanelSubheading';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldLabel, FieldSet } from '~/components/ui/field';
import { Input, NUMBER_INPUT_CLASS } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { WeightUnit } from '~/lib/lifting/format';
import {
    settingsFormSchema,
    type SettingsFormValues,
    type UpdateSettingsInput,
} from '~/lib/lifting/schemas';
import {
    UNIT_DISTANCE_VALUES,
    UNIT_LENGTH_VALUES,
    UNIT_WEIGHT_VALUES,
    WEEK_START_VALUES,
    type WeekStart,
} from '~/lib/lifting/types';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

type Settings = RouterOutputs['lifting']['settings']['get'];

const WEEK_START_LABEL: Readonly<Record<WeekStart, string>> = {
    mon: 'Monday',
    sun: 'Sunday',
};

const LEAD_FIELD_COLUMNS_CLASS =
    'md:grid-cols-[12rem_minmax(0,1fr)] md:gap-x-10';

export function LiftingSettingsForm({ initial }: { initial: Settings }) {
    const utilities = api.useUtils();
    const update = api.lifting.settings.update.useMutation({
        onSuccess: () => {
            toast.success('Settings saved');
            return utilities.lifting.settings.get.invalidate();
        },
    });

    const [saved, setSaved] = useState<SettingsFormValues>(() =>
        settingsFormValuesOf(initial),
    );

    const form = useForm<SettingsFormValues>({
        defaultValues: settingsFormValuesOf(initial),
        resolver: zodResolver(settingsFormSchema),
    });

    const [plateDraft, setPlateDraft] = useState('');
    const formId = useId();

    const unitWeight = useWatch({ control: form.control, name: 'unitWeight' });
    const availablePlatesKg = useWatch({
        control: form.control,
        name: 'availablePlatesKg',
    });

    const onSubmit = form.handleSubmit((values) => {
        const isPlatesChanged =
            values.availablePlatesKg.length !==
                saved.availablePlatesKg.length ||
            values.availablePlatesKg.some(
                (p, index) => p !== saved.availablePlatesKg[index],
            );
        const diff: UpdateSettingsInput = {
            ...(values.barWeightKg !== saved.barWeightKg && {
                barWeightKg: values.barWeightKg,
            }),
            ...(values.defaultRestSeconds !== saved.defaultRestSeconds && {
                defaultRestSeconds: values.defaultRestSeconds,
            }),
            ...(values.unitDistance !== saved.unitDistance && {
                unitDistance: values.unitDistance,
            }),
            ...(values.unitLength !== saved.unitLength && {
                unitLength: values.unitLength,
            }),
            ...(values.unitWeight !== saved.unitWeight && {
                unitWeight: values.unitWeight,
            }),
            ...(values.weekStart !== saved.weekStart && {
                weekStart: values.weekStart,
            }),
            ...(isPlatesChanged && {
                availablePlatesKg: [...values.availablePlatesKg],
            }),
        };
        update.mutate(diff, {
            onSuccess: () => {
                const next = {
                    ...values,
                    availablePlatesKg: [...values.availablePlatesKg],
                };
                setSaved(next);
                form.reset(next);
            },
        });
    });

    const addPlate = () => {
        const n = Number(plateDraft);
        if (!Number.isFinite(n) || n <= 0) return;
        const asKg = WeightUnit.fromDisplay(n, unitWeight);
        const next = [...availablePlatesKg, asKg].toSorted((a, b) => b - a);
        form.setValue('availablePlatesKg', next, {
            shouldDirty: true,
            shouldValidate: true,
        });
        setPlateDraft('');
    };

    const removePlate = (index: number) => {
        const next = availablePlatesKg.filter((_, index_) => index_ !== index);
        form.setValue('availablePlatesKg', next, {
            shouldDirty: true,
            shouldValidate: true,
        });
    };

    return (
        <ToolPanel
            description="Units, bar and plates, and rest defaults used across the lifting tools."
            title="Settings"
        >
            <form
                className="flex flex-col gap-8"
                id={formId}
                onSubmit={onSubmit}
            >
                <Section className="grid-cols-3 md:grid-cols-3" title="Units">
                    <Controller
                        control={form.control}
                        name="unitWeight"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-unitWeight`}>
                                    Weight
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-unitWeight`}
                                    >
                                        <SelectValue>{field.value}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {UNIT_WEIGHT_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="unitDistance"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-unitDistance`}>
                                    Distance
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-unitDistance`}
                                    >
                                        <SelectValue>{field.value}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {UNIT_DISTANCE_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="unitLength"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-unitLength`}>
                                    Length
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-unitLength`}
                                    >
                                        <SelectValue>{field.value}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {UNIT_LENGTH_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                </Section>

                <Section
                    className={LEAD_FIELD_COLUMNS_CLASS}
                    title="Bar and plates"
                >
                    <Controller
                        control={form.control}
                        name="barWeightKg"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-barWeightKg`}>
                                    Bar weight ({unitWeight})
                                </FieldLabel>
                                <Input
                                    aria-invalid={fieldState.invalid}
                                    className="tabular-nums"
                                    id={`${formId}-barWeightKg`}
                                    inputMode="decimal"
                                    onChange={(event) => {
                                        const raw = Number(event.target.value);
                                        const asKg = Number.isFinite(raw)
                                            ? WeightUnit.fromDisplay(
                                                  raw,
                                                  unitWeight,
                                              )
                                            : 0;
                                        field.onChange(asKg);
                                    }}
                                    ref={field.ref}
                                    step="any"
                                    type="number"
                                    value={Number(
                                        WeightUnit.toDisplay(
                                            field.value,
                                            unitWeight,
                                        ).toFixed(2),
                                    )}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <div className="flex flex-col gap-2">
                        <Label>
                            Available plates ({unitWeight}, per side options)
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                aria-label={`Plate weight (${unitWeight})`}
                                className={NUMBER_INPUT_CLASS}
                                inputMode="decimal"
                                onChange={(event) =>
                                    setPlateDraft(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter') {
                                        return;
                                    }

                                    event.preventDefault();
                                    addPlate();
                                }}
                                placeholder="Add plate"
                                type="number"
                                value={plateDraft}
                            />
                            <Button
                                onClick={addPlate}
                                type="button"
                                variant="outline"
                            >
                                Add
                            </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {availablePlatesKg.map((p, index) => {
                                const display = Number(
                                    WeightUnit.toDisplay(p, unitWeight).toFixed(
                                        2,
                                    ),
                                );
                                return (
                                    <Button
                                        aria-label={`Remove ${display} ${unitWeight} plate`}
                                        className="tabular-nums"
                                        key={`${p}-${index}`}
                                        onClick={() => removePlate(index)}
                                        size="sm"
                                        type="button"
                                        variant="outline"
                                    >
                                        {display}
                                        <X data-icon="inline-end" />
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                </Section>

                <Section
                    className={LEAD_FIELD_COLUMNS_CLASS}
                    title="Rest and week"
                >
                    <Controller
                        control={form.control}
                        name="weekStart"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-weekStart`}>
                                    Week starts on
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-weekStart`}
                                    >
                                        <SelectValue>
                                            {WEEK_START_LABEL[field.value]}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {WEEK_START_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {WEEK_START_LABEL[v]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="defaultRestSeconds"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    htmlFor={`${formId}-defaultRestSeconds`}
                                >
                                    Default rest (seconds)
                                </FieldLabel>
                                <Input
                                    aria-invalid={fieldState.invalid}
                                    className={NUMBER_INPUT_CLASS}
                                    id={`${formId}-defaultRestSeconds`}
                                    inputMode="numeric"
                                    min={0}
                                    onChange={(event) => {
                                        const n = Math.trunc(
                                            Number(event.target.value),
                                        );
                                        field.onChange(
                                            Number.isFinite(n) ? n : 0,
                                        );
                                    }}
                                    ref={field.ref}
                                    step="1"
                                    type="number"
                                    value={field.value}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                </Section>
                <ProfileFormFooter
                    isDirty={form.formState.isDirty}
                    isPending={update.isPending}
                    onCancel={() => {
                        form.reset();
                        setPlateDraft('');
                    }}
                />
            </form>
        </ToolPanel>
    );
}

function Section({
    children,
    className,
    title,
}: {
    children: React.ReactNode;
    className?: string;
    title: string;
}) {
    const titleId = useId();
    return (
        <FieldSet aria-labelledby={titleId} className="gap-3">
            <PanelSubheading id={titleId}>{title}</PanelSubheading>
            <div
                className={cn(
                    'grid grid-cols-1 gap-5 md:grid-cols-2',
                    className,
                )}
            >
                {children}
            </div>
        </FieldSet>
    );
}

function settingsFormValuesOf(settings: Settings): SettingsFormValues {
    return {
        availablePlatesKg: [...settings.availablePlatesKg],
        barWeightKg: settings.barWeightKg,
        defaultRestSeconds: settings.defaultRestSeconds,
        unitDistance: settings.unitDistance,
        unitLength: settings.unitLength,
        unitWeight: settings.unitWeight,
        weekStart: settings.weekStart,
    };
}
