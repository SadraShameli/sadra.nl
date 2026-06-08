'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { SetType, UnitDistance, UnitWeight } from '~/lib/lifting/types';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '~/components/ui/AlertDialog';
import { Button } from '~/components/ui/Button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
import { Form, FormControl, FormField, FormItem } from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { DistanceUnit, WeightUnit } from '~/lib/lifting/format';
import { cn } from '~/lib/utils';

import { NumberStepper } from '../shared/NumberStepper';

const TEMPO_PATTERN = /^\d-\d-\d-\d$/;

const setRowFormSchema = z.object({
    displayWeight: z.number().min(0),
    distance: z.string(),
    duration: z.string(),
    reps: z.number().int().min(0),
    rir: z.string(),
    rpe: z.string(),
    tempo: z.string(),
});
export interface SetRowData {
    completedAt: Date | null;
    distanceM: null | number;
    durationS: null | number;
    id: string;
    order: number;
    reps: null | number;
    rir: null | number;
    rpe: null | number;
    tempo: null | string;
    type: SetType;
    weightKg: null | number;
}

type SetRowFormValues = z.infer<typeof setRowFormSchema>;

interface SetRowProps {
    busy?: boolean;
    onComplete: (
        id: string,
        values: {
            distanceM: null | number;
            durationS: null | number;
            reps: null | number;
            rir: null | number;
            rpe: null | number;
            tempo: null | string;
            weightKg: null | number;
        },
    ) => void;
    onDelete: (id: string) => void;
    set: SetRowData;
    unitDistance: UnitDistance;
    unitWeight: UnitWeight;
    weightStepKg?: number;
}

const TYPE_LABEL: Record<SetType, string> = {
    amrap: 'AMRAP',
    backoff: 'B/O',
    dropset: 'Drop',
    failure: 'Fail',
    topset: 'Top',
    warmup: 'WU',
    working: 'W',
};

export function SetRow({
    busy = false,
    onComplete,
    onDelete,
    set,
    unitDistance,
    unitWeight,
    weightStepKg = 2.5,
}: SetRowProps) {
    const form = useForm<SetRowFormValues>({
        defaultValues: deriveDefaults(set, unitWeight, unitDistance),
        resolver: zodResolver(setRowFormSchema),
    });
    const [deleteOpen, setDeleteOpen] = useState(false);
    const isCompleted = set.completedAt !== null;

    const setRef = useRef(set);
    setRef.current = set;
    useEffect(() => {
        form.reset(deriveDefaults(setRef.current, unitWeight, unitDistance));
    }, [form, set.id, unitDistance, unitWeight]);

    const stepInDisplay =
        unitWeight === 'kg' ? weightStepKg : weightStepKg / 0.45359237;

    const rpeValue = form.watch('rpe');
    const rirValue = form.watch('rir');
    const tempoValue = form.watch('tempo');
    const distanceValue = form.watch('distance');
    const durationValue = form.watch('duration');

    const handleComplete = form.handleSubmit((values) => {
        const weightKg = WeightUnit.fromDisplay(
            values.displayWeight,
            unitWeight,
        );
        onComplete(set.id, {
            distanceM: parseDistance(values.distance, unitDistance),
            durationS: parseDuration(values.duration),
            reps: values.reps > 0 ? values.reps : null,
            rir: parseRir(values.rir),
            rpe: parseRpe(values.rpe),
            tempo: parseTempo(values.tempo),
            weightKg: values.displayWeight > 0 ? weightKg : null,
        });
    });

    return (
        <Form {...form}>
            <form
                className={cn(
                    'rounded-xl border border-border/30 bg-background/40 p-2 transition md:flex md:items-end md:gap-2',
                    isCompleted && 'bg-muted/40 opacity-90',
                )}
                onSubmit={handleComplete}
            >
                <div className="flex items-center justify-between gap-2 md:contents">
                    <div
                        className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                            'bg-accent/40 text-muted-foreground',
                        )}
                    >
                        {TYPE_LABEL[set.type] === 'W'
                            ? set.order
                            : TYPE_LABEL[set.type]}
                    </div>

                    <div className="flex items-center gap-1 md:order-last md:ml-auto">
                        <Button
                            aria-label="Complete set"
                            className="size-9 rounded-full p-0"
                            disabled={busy}
                            type="submit"
                            variant={isCompleted ? 'secondary' : 'default'}
                        >
                            <Check className="size-4" />
                        </Button>
                        <DropdownMenu>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            aria-label="Set options"
                                            className="size-9 p-0"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <MoreHorizontal className="size-4 text-muted-foreground" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Set options</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    className="text-destructive"
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        setDeleteOpen(true);
                                    }}
                                >
                                    <Trash2 className="mr-2 size-4" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:mt-0 md:contents">
                    <FormField
                        control={form.control}
                        name="displayWeight"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <NumberStepper
                                        decimals={1}
                                        label="Weight"
                                        onChange={field.onChange}
                                        step={stepInDisplay}
                                        suffix={unitWeight}
                                        value={field.value}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="reps"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <NumberStepper
                                        decimals={0}
                                        label="Reps"
                                        onChange={field.onChange}
                                        step={1}
                                        suffix="×"
                                        value={field.value}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 md:basis-full md:grid-cols-5">
                    <FormField
                        control={form.control}
                        name="rpe"
                        render={({ field }) => (
                            <FormItem className="flex flex-col gap-1">
                                <label
                                    className="text-[10px] tracking-wide text-muted-foreground uppercase"
                                    htmlFor={`set-${set.id}-rpe`}
                                >
                                    RPE
                                </label>
                                <FormControl>
                                    <Input
                                        aria-invalid={
                                            rpeValue !== '' &&
                                            parseRpe(rpeValue) === null
                                        }
                                        className="h-9 text-sm tabular-nums"
                                        id={`set-${set.id}-rpe`}
                                        inputMode="decimal"
                                        max={10}
                                        min={1}
                                        placeholder="1–10"
                                        step="0.5"
                                        type="number"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="rir"
                        render={({ field }) => (
                            <FormItem className="flex flex-col gap-1">
                                <label
                                    className="text-[10px] tracking-wide text-muted-foreground uppercase"
                                    htmlFor={`set-${set.id}-rir`}
                                >
                                    RIR
                                </label>
                                <FormControl>
                                    <Input
                                        aria-invalid={
                                            rirValue !== '' &&
                                            parseRir(rirValue) === null
                                        }
                                        className="h-9 text-sm tabular-nums"
                                        id={`set-${set.id}-rir`}
                                        inputMode="numeric"
                                        max={10}
                                        min={0}
                                        placeholder="0–10"
                                        step="1"
                                        type="number"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="tempo"
                        render={({ field }) => (
                            <FormItem className="flex flex-col gap-1">
                                <label
                                    className="text-[10px] tracking-wide text-muted-foreground uppercase"
                                    htmlFor={`set-${set.id}-tempo`}
                                >
                                    Tempo
                                </label>
                                <FormControl>
                                    <Input
                                        aria-invalid={
                                            tempoValue !== '' &&
                                            parseTempo(tempoValue) === null
                                        }
                                        className="h-9 text-sm tabular-nums"
                                        id={`set-${set.id}-tempo`}
                                        placeholder="3-1-1-0"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="distance"
                        render={({ field }) => (
                            <FormItem className="flex flex-col gap-1">
                                <label
                                    className="text-[10px] tracking-wide text-muted-foreground uppercase"
                                    htmlFor={`set-${set.id}-distance`}
                                >
                                    Distance ({unitDistance})
                                </label>
                                <FormControl>
                                    <Input
                                        aria-invalid={
                                            distanceValue !== '' &&
                                            parseDistance(
                                                distanceValue,
                                                unitDistance,
                                            ) === null
                                        }
                                        className="h-9 text-sm tabular-nums"
                                        id={`set-${set.id}-distance`}
                                        inputMode="decimal"
                                        min={0}
                                        placeholder={
                                            unitDistance === 'm' ? '500' : '1.0'
                                        }
                                        step="any"
                                        type="number"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="duration"
                        render={({ field }) => (
                            <FormItem className="flex flex-col gap-1">
                                <label
                                    className="text-[10px] tracking-wide text-muted-foreground uppercase"
                                    htmlFor={`set-${set.id}-duration`}
                                >
                                    Duration (s)
                                </label>
                                <FormControl>
                                    <Input
                                        aria-invalid={
                                            durationValue !== '' &&
                                            parseDuration(durationValue) ===
                                                null
                                        }
                                        className="h-9 text-sm tabular-nums"
                                        id={`set-${set.id}-duration`}
                                        inputMode="numeric"
                                        min={0}
                                        placeholder="60"
                                        step="1"
                                        type="number"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete set?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Set {set.order} will be removed permanently.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(set.id)}>
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </form>
        </Form>
    );
}

function deriveDefaults(
    set: SetRowData,
    unitWeight: UnitWeight,
    unitDistance: UnitDistance,
): SetRowFormValues {
    return {
        displayWeight: WeightUnit.toDisplay(set.weightKg ?? 0, unitWeight),
        distance:
            set.distanceM === null
                ? ''
                : String(DistanceUnit.toDisplay(set.distanceM, unitDistance)),
        duration: set.durationS?.toString() ?? '',
        reps: set.reps ?? 0,
        rir: set.rir?.toString() ?? '',
        rpe: set.rpe?.toString() ?? '',
        tempo: set.tempo ?? '',
    };
}

function parseDistance(raw: string, unit: UnitDistance): null | number {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return DistanceUnit.fromDisplay(n, unit);
}

function parseDuration(raw: string): null | number {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
}

function parseRir(raw: string): null | number {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10) return null;
    return n;
}

function parseRpe(raw: string): null | number {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 1 || n > 10) return null;
    return n;
}

function parseTempo(raw: string): null | string {
    const trimmed = raw.trim();
    return TEMPO_PATTERN.test(trimmed) ? trimmed : null;
}
