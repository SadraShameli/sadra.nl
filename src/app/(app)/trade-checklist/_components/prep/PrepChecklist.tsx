'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '~/components/ui/Button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '~/components/ui/Form';
import { Label } from '~/components/ui/Label';
import { Progress } from '~/components/ui/Progress';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import {
    type DailyPreparationRow,
    prepChecksSchema,
} from '~/lib/schemas/trading';
import { deletePrep, savePrep } from '~/lib/trading/actions';
import {
    PREP_CHECK_KEYS,
    type PrepCheckKey,
    type PrepChecks,
} from '~/lib/trading/types';
import { cn } from '~/lib/utils';

const prepFormSchema = z.object({
    checks: prepChecksSchema,
    notes: z.string(),
});
type PrepFormValues = z.infer<typeof prepFormSchema>;

const CHECK_META: Record<PrepCheckKey, { hint: string; label: string }> = {
    accountRiskReset: {
        hint: 'Risk per trade reset, max trades for today decided.',
        label: 'Account risk reset',
    },
    economicEventsChecked: {
        hint: 'Reviewed today’s news calendar — flagged times to avoid.',
        label: 'Economic events checked',
    },
    htfBiasConfirmed: {
        hint: 'Weekly and daily bias still match what was on the chart yesterday.',
        label: 'HTF bias confirmed',
    },
    journalReviewed: {
        hint: 'Read yesterday’s assessments, noted what to repeat or avoid.',
        label: 'Journal reviewed',
    },
    keyLevelsMarked: {
        hint: 'PD arrays, swing points, and liquidity pools drawn on every timeframe.',
        label: 'Key levels marked',
    },
    mentalCheckIn: {
        hint: 'Rested, focused, no off-screen distractions queued up.',
        label: 'Mental check-in',
    },
    setupPlanWritten: {
        hint: 'Concrete plan written down: DOL, entry trigger, invalidation.',
        label: 'Setup plan written',
    },
};

interface PrepChecklistProperties {
    date: string;
    existing: DailyPreparationRow | null;
    initialChecks: PrepChecks;
    initialNotes: string;
    isToday: boolean;
    planId: null | string;
}

export function PrepChecklist({
    date,
    existing,
    initialChecks,
    initialNotes,
    isToday,
    planId,
}: PrepChecklistProperties) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const form = useForm<PrepFormValues>({
        defaultValues: { checks: initialChecks, notes: initialNotes },
        resolver: zodResolver(prepFormSchema),
    });
    const checks = form.watch('checks');

    const completed = PREP_CHECK_KEYS.filter((k) => checks[k]).length;
    const score = (completed / PREP_CHECK_KEYS.length) * 100;

    const toggle = (key: PrepCheckKey) => {
        if (!isToday) return;
        form.setValue(
            'checks',
            { ...checks, [key]: !checks[key] },
            {
                shouldDirty: true,
            },
        );
    };

    const save = form.handleSubmit((values) => {
        startTransition(async () => {
            await savePrep({
                checks: values.checks,
                date,
                notes: values.notes.trim() || null,
                planId,
            });
            router.refresh();
        });
    });

    const remove = () => {
        if (!existing) return;
        startTransition(async () => {
            await deletePrep({ date });
            router.refresh();
        });
    };

    return (
        <Form {...form}>
            <form
                className={cn(
                    'app-trade-checklist__prep-checklist',
                    'flex flex-col gap-4',
                )}
                onSubmit={save}
            >
                <div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs tracking-wider text-muted-foreground uppercase">
                            Discipline score
                        </span>
                        <span className="font-mono text-sm">
                            {completed} / {PREP_CHECK_KEYS.length} ·{' '}
                            {score.toFixed(0)}%
                        </span>
                    </div>
                    <Progress className="mt-2 h-2" value={score} />
                </div>

                <ul
                    className={cn(
                        'app-trade-checklist__prep-items',
                        'flex flex-col gap-2',
                    )}
                >
                    {PREP_CHECK_KEYS.map((key) => {
                        const meta = CHECK_META[key];
                        return (
                            <li
                                className={cn(
                                    'app-trade-checklist__prep-item',
                                    'flex items-center gap-3 rounded-md border border-border/40 p-3',
                                )}
                                data-state={
                                    checks[key] ? 'checked' : 'unchecked'
                                }
                                key={key}
                            >
                                <div className="min-w-0 flex-1">
                                    <Label
                                        className="text-sm font-medium"
                                        htmlFor={`prep-${key}`}
                                    >
                                        {meta.label}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        {meta.hint}
                                    </p>
                                </div>
                                <Switch
                                    checked={checks[key]}
                                    disabled={!isToday || pending}
                                    id={`prep-${key}`}
                                    onCheckedChange={() => toggle(key)}
                                />
                            </li>
                        );
                    })}
                </ul>

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-sm">Notes</FormLabel>
                            <FormControl>
                                <Textarea
                                    disabled={!isToday || pending}
                                    placeholder="One concrete thing you are watching for today."
                                    rows={3}
                                    {...field}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                {isToday && (
                    <div className="flex justify-end gap-2">
                        {existing && (
                            <Button
                                disabled={pending}
                                onClick={remove}
                                type="button"
                                variant="ghost"
                            >
                                <Trash2 className="mr-1 size-4" />
                                Clear day
                            </Button>
                        )}
                        <Button disabled={pending} type="submit">
                            <Save className="mr-1 size-4" />
                            {existing ? 'Update prep' : 'Save prep'}
                        </Button>
                    </div>
                )}

                {!isToday && (
                    <p className="text-xs text-muted-foreground">
                        Read-only view of a past day.
                    </p>
                )}
            </form>
        </Form>
    );
}
