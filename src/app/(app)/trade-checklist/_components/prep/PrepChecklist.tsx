'use client';

import { Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { DailyPreparationRow } from '~/lib/schemas/trading';

import { Button } from '~/components/ui/Button';
import { Label } from '~/components/ui/Label';
import { Progress } from '~/components/ui/Progress';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import { deletePrep, savePrep } from '~/lib/trading-actions';
import {
    PREP_CHECK_KEYS,
    type PrepCheckKey,
    type PrepChecks,
} from '~/lib/trading-types';

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

interface PrepChecklistProps {
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
}: PrepChecklistProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [checks, setChecks] = useState<PrepChecks>(initialChecks);
    const [notes, setNotes] = useState<string>(initialNotes);

    const completed = PREP_CHECK_KEYS.filter((k) => checks[k]).length;
    const score = (completed / PREP_CHECK_KEYS.length) * 100;

    const toggle = (key: PrepCheckKey) => {
        if (!isToday) return;
        setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const save = () => {
        startTransition(async () => {
            await savePrep({
                checks,
                date,
                notes: notes.trim() || null,
                planId,
            });
            router.refresh();
        });
    };

    const remove = () => {
        if (!existing) return;
        startTransition(async () => {
            await deletePrep({ date });
            router.refresh();
        });
    };

    return (
        <div className="space-y-4">
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

            <ul className="space-y-2">
                {PREP_CHECK_KEYS.map((key) => {
                    const meta = CHECK_META[key];
                    return (
                        <li
                            className="flex items-center gap-3 rounded-md border border-border/40 p-3"
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

            <div>
                <Label className="text-sm" htmlFor="prepNotes">
                    Notes
                </Label>
                <Textarea
                    className="mt-2"
                    disabled={!isToday || pending}
                    id="prepNotes"
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="One concrete thing you are watching for today."
                    rows={3}
                    value={notes}
                />
            </div>

            {isToday && (
                <div className="flex justify-end gap-2">
                    {existing && (
                        <Button
                            disabled={pending}
                            onClick={remove}
                            variant="ghost"
                        >
                            <Trash2 className="mr-1 size-4" />
                            Clear day
                        </Button>
                    )}
                    <Button disabled={pending} onClick={save}>
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
        </div>
    );
}
