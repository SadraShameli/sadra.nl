'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { badgeVariants } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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
} from '~/lib/lifting/types';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

type Settings = RouterOutputs['lifting']['settings']['get'];

export function LiftingSettingsForm({ initial }: { initial: Settings }) {
    const utilities = api.useUtils();
    const update = api.lifting.settings.update.useMutation({
        onSuccess: () => {
            toast.success('Settings saved');
            return utilities.lifting.settings.get.invalidate();
        },
    });

    const form = useForm<SettingsFormValues>({
        defaultValues: {
            availablePlatesKg: [...initial.availablePlatesKg],
            barWeightKg: initial.barWeightKg,
            defaultRestSeconds: initial.defaultRestSeconds,
            unitDistance: initial.unitDistance,
            unitLength: initial.unitLength,
            unitWeight: initial.unitWeight,
            weekStart: initial.weekStart,
        },
        resolver: zodResolver(settingsFormSchema),
    });

    const [plateDraft, setPlateDraft] = useState('');

    const unitWeight = form.watch('unitWeight');
    const availablePlatesKg = form.watch('availablePlatesKg');

    const onSubmit = form.handleSubmit((values) => {
        const diff: UpdateSettingsInput = {};
        if (values.barWeightKg !== initial.barWeightKg)
            diff.barWeightKg = values.barWeightKg;
        if (values.defaultRestSeconds !== initial.defaultRestSeconds)
            diff.defaultRestSeconds = values.defaultRestSeconds;
        if (values.unitDistance !== initial.unitDistance)
            diff.unitDistance = values.unitDistance;
        if (values.unitLength !== initial.unitLength)
            diff.unitLength = values.unitLength;
        if (values.unitWeight !== initial.unitWeight)
            diff.unitWeight = values.unitWeight;
        if (values.weekStart !== initial.weekStart)
            diff.weekStart = values.weekStart;
        const isPlatesChanged =
            values.availablePlatesKg.length !==
                initial.availablePlatesKg.length ||
            values.availablePlatesKg.some(
                (p, index) => p !== initial.availablePlatesKg[index],
            );
        if (isPlatesChanged)
            diff.availablePlatesKg = [...values.availablePlatesKg];
        update.mutate(diff);
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
        <Form {...form}>
            <form className="flex flex-col gap-8" onSubmit={onSubmit}>
                <Section title="Units">
                    <FormField
                        control={form.control}
                        name="unitWeight"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Weight</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {UNIT_WEIGHT_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="unitDistance"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Distance</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {UNIT_DISTANCE_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="unitLength"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Length</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {UNIT_LENGTH_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </Section>

                <Section title="Bar and plates">
                    <FormField
                        control={form.control}
                        name="barWeightKg"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bar weight ({unitWeight})</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="decimal"
                                        onChange={(event) => {
                                            const raw = Number(
                                                event.target.value,
                                            );
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
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="flex flex-col gap-2">
                        <Label>
                            Available plates ({unitWeight}, per side options)
                        </Label>
                        <div className="flex gap-2">
                            <Input
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
                                    <button
                                        aria-label={`Remove ${display} ${unitWeight} plate`}
                                        className={cn(
                                            badgeVariants({
                                                variant: 'outline',
                                            }),
                                            'cursor-pointer gap-1 tabular-nums hover:border-destructive hover:bg-destructive hover:text-destructive-foreground',
                                        )}
                                        key={`${p}-${index}`}
                                        onClick={() => removePlate(index)}
                                        type="button"
                                    >
                                        {display}
                                        <X className="size-3 opacity-60" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </Section>

                <Section title="Rest and week">
                    <FormField
                        control={form.control}
                        name="defaultRestSeconds"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Default rest (seconds)</FormLabel>
                                <FormControl>
                                    <Input
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
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="weekStart"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Week starts on</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {WEEK_START_VALUES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {v === 'mon'
                                                    ? 'Monday'
                                                    : 'Sunday'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </Section>

                <div className="flex items-center justify-end gap-3">
                    <Button disabled={update.isPending} type="submit">
                        {update.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

function Section({
    children,
    title,
}: {
    children: React.ReactNode;
    title: string;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {children}
                </div>
            </CardContent>
        </Card>
    );
}
