'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import type { Outcome, TradeAssessmentRow } from '~/lib/trading/types';

import { EXECUTION_DEVIATION_LABEL } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { SwitchCard } from '~/components/ToggleCard';
import { Button } from '~/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/collapsible';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { executionDeviationSchema, outcomeSchema } from '~/lib/schemas/trading';
import { recordAssessmentOutcome } from '~/lib/trading/actions';
import { EXECUTION_DEVIATION_VALUES } from '~/lib/trading/types';
import { cn } from '~/lib/utilities';

import { ChoiceCards, type ChoiceOption } from './WizardFields';

const OUTCOMES: readonly ChoiceOption<Outcome>[] = [
    { label: 'Win', value: 'win' },
    { label: 'Loss', value: 'loss' },
    { label: 'Breakeven', value: 'breakeven' },
    { label: 'No trade', value: 'no-trade' },
];

const DEVIATIONS = EXECUTION_DEVIATION_VALUES.map((value) => ({
    label: EXECUTION_DEVIATION_LABEL[value],
    value,
}));

const outcomeFormSchema = z.object({
    actualRisk: z.string(),
    deviations: z.array(executionDeviationSchema),
    followedPlan: z.boolean(),
    notes: z.string(),
    outcome: outcomeSchema,
    outcomeR: z.string(),
});
type OutcomeFormValues = z.infer<typeof outcomeFormSchema>;

type SavedOutcome = Pick<
    TradeAssessmentRow,
    | 'actualRiskTaken'
    | 'executionDeviations'
    | 'followedPlan'
    | 'outcome'
    | 'outcomeNotes'
    | 'outcomeR'
>;

export function OutcomeDialog({
    assessmentId,
    onOpenChange,
    open,
    saved,
}: {
    assessmentId: string;
    onOpenChange: (isOpen: boolean) => void;
    open: boolean;
    saved: null | SavedOutcome;
}) {
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

                <OutcomeForm
                    assessmentId={assessmentId}
                    key={assessmentId}
                    onOpenChange={onOpenChange}
                    saved={saved}
                />
            </DialogContent>
        </Dialog>
    );
}

function hasExecutionDetails(saved: null | SavedOutcome): boolean {
    return (
        saved !== null &&
        (saved.actualRiskTaken !== null ||
            saved.followedPlan !== null ||
            (saved.executionDeviations?.length ?? 0) > 0)
    );
}

function OutcomeForm({
    assessmentId,
    onOpenChange,
    saved,
}: {
    assessmentId: string;
    onOpenChange: (isOpen: boolean) => void;
    saved: null | SavedOutcome;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [executionOpen, setExecutionOpen] = useState(() =>
        hasExecutionDetails(saved),
    );

    const form = useForm<OutcomeFormValues>({
        defaultValues: outcomeFormValuesOf(saved),
        resolver: zodResolver(outcomeFormSchema),
    });
    const formId = useId();

    const deviations = useWatch({ control: form.control, name: 'deviations' });

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
        <form className="flex flex-col gap-4" onSubmit={submit}>
            <Controller
                control={form.control}
                name="outcome"
                render={({ field }) => (
                    <ChoiceCards
                        className="md:grid-cols-4"
                        legend="Outcome"
                        onValueChange={field.onChange}
                        options={OUTCOMES}
                        value={field.value}
                    />
                )}
            />

            <Controller
                control={form.control}
                name="outcomeR"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-outcomeR`}>
                            Actual R (optional)
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-outcomeR`}
                            placeholder="+2.0"
                            step="0.1"
                            type="number"
                            {...field}
                        />
                    </Field>
                )}
            />

            <Controller
                control={form.control}
                name="notes"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-notes`}>
                            Notes
                        </FieldLabel>
                        <Textarea
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-notes`}
                            placeholder="What happened, what worked, what to remember."
                            rows={3}
                            {...field}
                        />
                    </Field>
                )}
            />

            <Collapsible
                className="rounded-2xl border border-line"
                onOpenChange={setExecutionOpen}
                open={executionOpen}
            >
                <CollapsibleTrigger asChild>
                    <Button
                        className={cn(
                            'app-trade-checklist__outcome-execution-toggle',
                            'group h-auto w-full justify-between px-4 py-3',
                        )}
                        type="button"
                        variant="ghost"
                    >
                        Execution details (optional)
                        <ChevronDown
                            className="transition-transform group-data-[state=open]:rotate-180"
                            data-icon="inline-end"
                        />
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <FieldGroup className="gap-4 border-t border-line p-4">
                        <Controller
                            control={form.control}
                            name="actualRisk"
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel
                                        htmlFor={`${formId}-actualRisk`}
                                    >
                                        Actual risk taken ($)
                                    </FieldLabel>
                                    <Input
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-actualRisk`}
                                        placeholder="250"
                                        step="1"
                                        type="number"
                                        {...field}
                                    />
                                </Field>
                            )}
                        />

                        <Controller
                            control={form.control}
                            name="followedPlan"
                            render={({ field }) => (
                                <SwitchCard
                                    checked={field.value}
                                    id={`${formId}-followedPlan`}
                                    label="Followed the plan as written"
                                    onCheckedChange={field.onChange}
                                />
                            )}
                        />

                        <FieldSet>
                            <FieldLegend variant="label">
                                Deviations
                            </FieldLegend>
                            <ToggleGroup
                                aria-label="Deviations"
                                className="flex flex-wrap justify-start gap-2"
                                onValueChange={(selected) =>
                                    form.setValue(
                                        'deviations',
                                        DEVIATIONS.filter((d) =>
                                            selected.includes(d.value),
                                        ).map((d) => d.value),
                                        { shouldDirty: true },
                                    )
                                }
                                size="sm"
                                type="multiple"
                                value={deviations}
                                variant="outline"
                            >
                                {DEVIATIONS.map((d) => (
                                    <ToggleGroupItem
                                        key={d.value}
                                        value={d.value}
                                    >
                                        {d.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </FieldSet>
                    </FieldGroup>
                </CollapsibleContent>
            </Collapsible>

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
    );
}

function outcomeFormValuesOf(saved: null | SavedOutcome): OutcomeFormValues {
    return {
        actualRisk:
            saved?.actualRiskTaken == null ? '' : String(saved.actualRiskTaken),
        deviations: [...(saved?.executionDeviations ?? [])],
        followedPlan: saved?.followedPlan ?? true,
        notes: saved?.outcomeNotes ?? '',
        outcome: saved?.outcome ?? 'win',
        outcomeR: saved?.outcomeR == null ? '' : String(saved.outcomeR),
    };
}

function parseNullableNumber(raw: string): null | number {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
}
