'use client';

import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { ExecutionDeviation, Outcome } from '~/lib/trading-types';

import { Button } from '~/components/ui/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/RadioGroup';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import { recordAssessmentOutcome } from '~/lib/trading-actions';
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
    const [outcome, setOutcome] = useState<Outcome>('win');
    const [outcomeR, setOutcomeR] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [executionOpen, setExecutionOpen] = useState(false);
    const [actualRisk, setActualRisk] = useState<string>('');
    const [followedPlan, setFollowedPlan] = useState<boolean>(true);
    const [deviations, setDeviations] = useState<ExecutionDeviation[]>([]);

    const toggleDeviation = (key: ExecutionDeviation) => {
        setDeviations((prev) =>
            prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key],
        );
    };

    const submit = () => {
        const parsedR = Number.parseFloat(outcomeR);
        const r = !outcomeR.trim() || Number.isNaN(parsedR) ? null : parsedR;
        const parsedRisk = Number.parseFloat(actualRisk);
        const risk =
            !actualRisk.trim() || Number.isNaN(parsedRisk) ? null : parsedRisk;
        const execTouched =
            risk !== null || deviations.length > 0 || executionOpen;
        startTransition(async () => {
            await recordAssessmentOutcome({
                actualRiskTaken: risk,
                executionDeviations: deviations.length > 0 ? deviations : null,
                followedPlan: execTouched ? followedPlan : null,
                id: assessmentId,
                notes: notes.trim() || null,
                outcome,
                outcomeR: r,
            });
            onOpenChange(false);
            router.refresh();
        });
    };

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Record trade outcome</DialogTitle>
                    <DialogDescription>
                        Tag this assessment so the hindsight stats improve.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <RadioGroup
                        className="grid grid-cols-2 gap-2"
                        onValueChange={(v) => setOutcome(v as Outcome)}
                        value={outcome}
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

                    <div>
                        <Label className="text-sm" htmlFor="outcomeR">
                            Actual R (optional)
                        </Label>
                        <Input
                            className="mt-2"
                            id="outcomeR"
                            onChange={(e) => setOutcomeR(e.target.value)}
                            placeholder="+2.0"
                            step="0.1"
                            type="number"
                            value={outcomeR}
                        />
                    </div>

                    <div>
                        <Label className="text-sm" htmlFor="outcomeNotes">
                            Notes
                        </Label>
                        <Textarea
                            className="mt-2"
                            id="outcomeNotes"
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="What happened, what worked, what to remember."
                            rows={3}
                            value={notes}
                        />
                    </div>

                    <div className="rounded-md border border-border/40">
                        <button
                            className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent/30"
                            onClick={() => setExecutionOpen((o) => !o)}
                            type="button"
                        >
                            <span className="font-medium">
                                Execution details (optional)
                            </span>
                            <ChevronDown
                                className={cn(
                                    'size-4 transition-transform',
                                    executionOpen && 'rotate-180',
                                )}
                            />
                        </button>

                        {executionOpen && (
                            <div className="space-y-4 border-t border-border/40 p-3">
                                <div>
                                    <Label
                                        className="text-sm"
                                        htmlFor="actualRisk"
                                    >
                                        Actual risk taken ($)
                                    </Label>
                                    <Input
                                        className="mt-2"
                                        id="actualRisk"
                                        onChange={(e) =>
                                            setActualRisk(e.target.value)
                                        }
                                        placeholder="250"
                                        step="1"
                                        type="number"
                                        value={actualRisk}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label
                                        className="text-sm"
                                        htmlFor="followedPlan"
                                    >
                                        Followed the plan as written
                                    </Label>
                                    <Switch
                                        checked={followedPlan}
                                        id="followedPlan"
                                        onCheckedChange={setFollowedPlan}
                                    />
                                </div>

                                <div>
                                    <Label className="text-sm">
                                        Deviations
                                    </Label>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {DEVIATIONS.map((d) => (
                                            <button
                                                className={cn(
                                                    'rounded-full border px-2.5 py-1 text-xs transition',
                                                    deviations.includes(d.value)
                                                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                                                        : 'border-border/40 text-muted-foreground hover:border-border',
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
                </div>

                <DialogFooter>
                    <Button
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                        variant="ghost"
                    >
                        Cancel
                    </Button>
                    <Button disabled={pending} onClick={submit}>
                        Save outcome
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
