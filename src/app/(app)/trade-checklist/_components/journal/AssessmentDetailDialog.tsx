'use client';

import { format } from 'date-fns';

import type { TradeAssessmentRow } from '~/lib/trading-types';

import { Badge } from '~/components/ui/Badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { Progress } from '~/components/ui/Progress';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Separator } from '~/components/ui/Separator';
import { WEIGHT_CATEGORIES } from '~/lib/trading-defaults';
import { cn } from '~/lib/utils';

interface AssessmentDetailDialogProps {
    onClose: () => void;
    row: null | TradeAssessmentRow;
}

export function AssessmentDetailDialog({
    onClose,
    row,
}: AssessmentDetailDialogProps) {
    if (!row) return null;

    const { answers, result } = row;
    const windowLabel = row.planSnapshot.windows.find(
        (w) => w.id === answers.context.windowId,
    )?.label;

    return (
        <Dialog onOpenChange={(open) => !open && onClose()} open>
            <DialogContent
                aria-describedby={undefined}
                className={cn(
                    'app-trade-checklist__assessment-dialog',
                    'max-h-[90vh] sm:max-w-2xl',
                )}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-baseline gap-3">
                        <span className="font-orbitron text-3xl">
                            {row.grade}
                        </span>
                        <span className="font-mono text-sm text-muted-foreground">
                            {row.score.toFixed(1)} / 100
                        </span>
                        <Badge className="ml-auto" variant="outline">
                            {row.recommendation}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    <div className="flex flex-col gap-4 pr-3">
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(row.createdAt), 'PPpp')}
                            {windowLabel && ` · ${windowLabel}`}
                            {' · '}
                            {answers.context.accountType === 'funded'
                                ? 'Funded'
                                : 'Eval'}
                        </p>

                        {row.outcome && (
                            <div className="rounded-md border border-border/40 p-3">
                                <p className="text-xs tracking-wider text-muted-foreground uppercase">
                                    Outcome
                                </p>
                                <p className="mt-1 text-sm">
                                    {row.outcome === 'win'
                                        ? 'Win'
                                        : row.outcome === 'loss'
                                          ? 'Loss'
                                          : row.outcome === 'breakeven'
                                            ? 'Breakeven'
                                            : 'Skipped'}
                                    {typeof row.outcomeR === 'number' &&
                                        ` · ${row.outcomeR > 0 ? '+' : ''}${row.outcomeR.toFixed(2)}R`}
                                </p>
                                {row.outcomeNotes && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {row.outcomeNotes}
                                    </p>
                                )}
                                {(row.actualRiskTaken !== null ||
                                    row.followedPlan !== null ||
                                    (row.executionDeviations &&
                                        row.executionDeviations.length >
                                            0)) && (
                                    <div className="mt-3 flex flex-col gap-1.5 border-t border-border/40 pt-3">
                                        <p className="text-xs tracking-wider text-muted-foreground uppercase">
                                            Execution
                                        </p>
                                        {row.actualRiskTaken !== null && (
                                            <p className="text-sm">
                                                Risked $
                                                {row.actualRiskTaken.toLocaleString()}
                                            </p>
                                        )}
                                        {row.followedPlan !== null && (
                                            <p className="text-sm">
                                                {row.followedPlan
                                                    ? '✓ Followed plan'
                                                    : '✗ Deviated from plan'}
                                            </p>
                                        )}
                                        {row.executionDeviations &&
                                            row.executionDeviations.length >
                                                0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {row.executionDeviations.map(
                                                        (d) => (
                                                            <span
                                                                className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300"
                                                                key={d}
                                                            >
                                                                {d}
                                                            </span>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                    </div>
                                )}
                            </div>
                        )}

                        <Separator />

                        <div>
                            <p className="mb-2 text-xs tracking-wider text-muted-foreground uppercase">
                                Component scores
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {WEIGHT_CATEGORIES.map((cat) => {
                                    const cs = result.componentScores[cat.key];
                                    const pct =
                                        cs.max > 0
                                            ? (cs.earned / cs.max) * 100
                                            : 0;
                                    return (
                                        <div
                                            className="rounded-md border border-border/40 p-2"
                                            key={cat.key}
                                        >
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-xs font-medium">
                                                    {cat.label}
                                                </span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {cs.earned.toFixed(1)} /{' '}
                                                    {cs.max.toFixed(0)}
                                                </span>
                                            </div>
                                            <Progress
                                                className="mt-1.5 h-1.5"
                                                value={pct}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {result.redFlags.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs tracking-wider text-rose-400 uppercase">
                                    Red flags
                                </p>
                                <ul
                                    className={cn(
                                        'app-trade-checklist__red-flags-list',
                                        'flex flex-col gap-1 text-sm text-rose-300',
                                    )}
                                >
                                    {result.redFlags.map((f, i) => (
                                        <li key={i}>· {f}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.strengths.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs tracking-wider text-emerald-400 uppercase">
                                    Strengths
                                </p>
                                <ul className="flex flex-col gap-1 text-sm text-emerald-200/90">
                                    {result.strengths.map((s, i) => (
                                        <li key={i}>· {s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.weaknesses.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs tracking-wider text-amber-400 uppercase">
                                    Weaknesses
                                </p>
                                <ul className="flex flex-col gap-1 text-sm text-amber-200/90">
                                    {result.weaknesses.map((w, i) => (
                                        <li key={i}>· {w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {answers.finals.notes && (
                            <div>
                                <p className="mb-2 text-xs tracking-wider text-muted-foreground uppercase">
                                    Notes
                                </p>
                                <p className="text-sm whitespace-pre-wrap">
                                    {answers.finals.notes}
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
