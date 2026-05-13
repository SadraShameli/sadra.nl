'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

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
import { RadioGroup, RadioGroupItem } from '~/components/ui/Radio-group';
import { Textarea } from '~/components/ui/Textarea';
import { recordAssessmentOutcome } from '~/lib/trading-actions';
import type { Outcome } from '~/lib/trading-types';

const OUTCOMES: { value: Outcome; label: string; tone: string }[] = [
    { value: 'win', label: 'Win', tone: 'border-emerald-500/50' },
    { value: 'loss', label: 'Loss', tone: 'border-rose-500/50' },
    { value: 'breakeven', label: 'Breakeven', tone: 'border-amber-500/50' },
    { value: 'no-trade', label: 'No trade', tone: 'border-border/60' },
];

export function OutcomeDialog({
    assessmentId,
    open,
    onOpenChange,
}: {
    assessmentId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [outcome, setOutcome] = useState<Outcome>('win');
    const [outcomeR, setOutcomeR] = useState<string>('');
    const [notes, setNotes] = useState<string>('');

    const submit = () => {
        const parsed = parseFloat(outcomeR);
        const r = !outcomeR.trim() || isNaN(parsed) ? null : parsed;
        startTransition(async () => {
            await recordAssessmentOutcome(
                assessmentId,
                outcome,
                r,
                notes.trim() || null,
            );
            onOpenChange(false);
            router.refresh();
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Record trade outcome</DialogTitle>
                    <DialogDescription>
                        Tag this assessment so the hindsight stats improve.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <RadioGroup
                        value={outcome}
                        onValueChange={(v) => setOutcome(v as Outcome)}
                        className="grid grid-cols-2 gap-2"
                    >
                        {OUTCOMES.map((o) => (
                            <label
                                key={o.value}
                                htmlFor={`outcome-${o.value}`}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition ${
                                    outcome === o.value
                                        ? o.tone
                                        : 'border-border/60 hover:border-border'
                                }`}
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
                        <Label htmlFor="outcomeR" className="text-sm">
                            Actual R (optional)
                        </Label>
                        <Input
                            id="outcomeR"
                            type="number"
                            step="0.1"
                            placeholder="+2.0"
                            value={outcomeR}
                            onChange={(e) => setOutcomeR(e.target.value)}
                            className="mt-2"
                        />
                    </div>

                    <div>
                        <Label htmlFor="outcomeNotes" className="text-sm">
                            Notes
                        </Label>
                        <Textarea
                            id="outcomeNotes"
                            rows={3}
                            placeholder="What happened, what worked, what to remember."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="mt-2"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending}>
                        Save outcome
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
