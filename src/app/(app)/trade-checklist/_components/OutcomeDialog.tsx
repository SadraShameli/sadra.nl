'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { ExecutionDeviation, Outcome } from '~/lib/trading/types';

import { badgeVariants } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/RadioGroup';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import { executionDeviationSchema, outcomeSchema } from '~/lib/schemas/trading';
import { recordAssessmentOutcome } from '~/lib/trading/actions';
import { cn } from '~/lib/utils';

const OUTCOMES: { label: string; tone: string; value: Outcome }[] = [
    { label: 'Win', tone: 'border-emerald-500/50', value: 'win' },
    { label: 'Loss', tone: 'border-rose-500/50', value: 'loss' },
    { label: 'Breakeven', tone: 'border-amber-500/50', value: 'breakeven' },
    { label: 'No trade', tone: 'border-border/60', value: 'no-trade' },
];

const DEVIATIONS: { label: string; value: ExecutionDeviation }[] = [
    { label: 'Sized down', value: 'sized-down' },
    { label: 'Sized up', value: 'sized-up' },
    { label: 'Moved stop early', value: 'moved-stop-early' },
    { label: 'Moved stop to BE', value: 'moved-stop-to-be' },
    { label: 'Exited before target', value: 'exited-before-target' },
    { label: 'Exited past target', value: 'exited-past-target' },
    { label: 'Entered late', value: 'entered-late' },
    { label: 'Chased entry', value: 'chased-entry' },
    { label: 'No fill', value: 'no-fill' },
];

const outcomeFormSchema = z.object({
    actualRisk: z.string(),
    deviations: z.array(executionDeviationSchema),
    followedPlan: z.boolean(),
    notes: z.string(),
    outcome: outcomeSchema,
    outcomeR: z.string(),
});
type OutcomeFormValues = z.infer<typeof outcomeFormSchema>;

export function OutcomeDialog({
    assessmentId,
    onOpenChange,
    open,
}: {
    assessmentId: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [executionOpen, setExecutionOpen] = useState(false);

    const form = useForm<OutcomeFormValues>({
        defaultValues: {
            actualRisk: '',
            deviations: [],
            followedPlan: true,
            notes: '',
            outcome: 'win',
            outcomeR: '',
        },
        resolver: zodResolver(outcomeFormSchema),
    });

    const deviations = form.watch('deviations');
    const outcome = form.watch('outcome');

    const toggleDeviation = (key: ExecutionDeviation) => {
        const current = form.getValues('deviations');
        form.setValue(
            'deviations',
            current.includes(key)
                ? current.filter((d) => d !== key)
                : [...current, key],
            { shouldDirty: true },
        );
    };

    const submit = form.handleSubmit((values) => {
        const risk = parseNullableNumber(values.actualRisk);
        const r = parseNullableNumber(values.outcomeR);
        const isExecTouched =
            risk !== null || values.deviations.length > 0 || executionOpen;
        startTransition(async () => {
            await recordAssessmentOutcome({
                actualRiskTaken: risk,
                executionDeviations:
                    values.deviations.length > 0 ? values.deviations : null,
                followedPlan: isExecTouched ? values.followedPlan : null,
                id: assessmentId,
                notes: values.notes.trim() || null,
                outcome: values.outcome,
                outcomeR: r,
            });
            onOpenChange(false);
            router.refresh();
        });
    });

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent
                className={cn(
                    'app-trade-checklist__outcome-dialog',
                    'max-h-[90vh] overflow-y-auto sm:max-w-md',
                )}
                data-state={open ? 'open' : 'closed'}
            >
                <DialogHeader>
                    <DialogTitle>Record trade outcome</DialogTitle>
                    <DialogDescription>
                        Tag this assessment so the hindsight stats improve.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form className="flex flex-col gap-4" onSubmit={submit}>
                        <FormField
                            control={form.control}
                            name="outcome"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <RadioGroup
                                            className="grid grid-cols-2 gap-2"
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            {OUTCOMES.map((o) => (
                                                <label
                                                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition ${
                                                        outcome === o.value
                                                            ? o.tone
                                                            : 'border-border/60 hover:border-border'
                                                    }`}
                                                    htmlFor={`outcome-${o.value}`}
                                                    key={o.value}
                                                >
                                                    <RadioGroupItem
                                                        id={`outcome-${o.value}`}
                                                        value={o.value}
                                                    />
                                                    {o.label}
                                                </label>
                                            ))}
                                        </RadioGroup>
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="outcomeR"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm">
                                        Actual R (optional)
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="+2.0"
                                            step="0.1"
                                            type="number"
                                            {...field}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm">
                                        Notes
                                    </FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="What happened, what worked, what to remember."
                                            rows={3}
                                            {...field}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <div className="rounded-md border border-border/40">
                            <Button
                                className={cn(
                                    'app-trade-checklist__outcome-execution-toggle',
                                    'h-auto w-full justify-between rounded-md px-3 py-2 text-sm font-medium',
                                )}
                                data-state={executionOpen ? 'open' : 'closed'}
                                onClick={() => setExecutionOpen((o) => !o)}
                                type="button"
                                variant="ghost"
                            >
                                <span>Execution details (optional)</span>
                                <ChevronDown
                                    className={cn(
                                        'size-4 transition-transform',
                                        executionOpen && 'rotate-180',
                                    )}
                                />
                            </Button>

                            {executionOpen && (
                                <div className="flex flex-col gap-4 border-t border-border/40 p-3">
                                    <FormField
                                        control={form.control}
                                        name="actualRisk"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm">
                                                    Actual risk taken ($)
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="250"
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
                                        name="followedPlan"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between gap-2">
                                                <FormLabel className="text-sm">
                                                    Followed the plan as written
                                                </FormLabel>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={
                                                            field.onChange
                                                        }
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <div>
                                        <Label className="text-sm">
                                            Deviations
                                        </Label>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {DEVIATIONS.map((d) => (
                                                <button
                                                    className={cn(
                                                        badgeVariants({
                                                            variant:
                                                                deviations.includes(
                                                                    d.value,
                                                                )
                                                                    ? 'warning'
                                                                    : 'outline',
                                                        }),
                                                        'cursor-pointer transition',
                                                    )}
                                                    key={d.value}
                                                    onClick={() =>
                                                        toggleDeviation(d.value)
                                                    }
                                                    type="button"
                                                >
                                                    {d.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                disabled={pending}
                                onClick={() => onOpenChange(false)}
                                type="button"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button disabled={pending} type="submit">
                                Save outcome
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function parseNullableNumber(raw: string): null | number {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseFloat(trimmed);
    return Number.isNaN(n) ? null : n;
}
