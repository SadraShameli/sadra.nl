'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { Outcome } from '~/lib/trading-types';

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
import { Textarea } from '~/components/ui/Textarea';
import { recordAssessmentOutcome } from '~/lib/trading-actions';

const OUTCOMES: { label: string; tone: string; value: Outcome }[] = [
    { label: 'Win', tone: 'border-emerald-500/50', value: 'win' },
    { label: 'Loss', tone: 'border-rose-500/50', value: 'loss' },
    { label: 'Breakeven', tone: 'border-amber-500/50', value: 'breakeven' },
    { label: 'No trade', tone: 'border-border/60', value: 'no-trade' },
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

    const submit = () => {
        const parsed = Number.parseFloat(outcomeR);
        const r = !outcomeR.trim() || Number.isNaN(parsed) ? null : parsed;
        startTransition(async () => {
            await recordAssessmentOutcome({
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
            <DialogContent className="sm:max-w-md">
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
