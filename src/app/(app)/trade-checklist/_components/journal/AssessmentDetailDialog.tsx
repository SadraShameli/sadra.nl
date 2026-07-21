'use client';

import { format } from 'date-fns';
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    NotebookPen,
    ShieldAlert,
} from 'lucide-react';

import type { TradeAssessmentRow } from '~/lib/trading/types';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { Progress } from '~/components/ui/Progress';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { Separator } from '~/components/ui/Separator';
import { WEIGHT_CATEGORIES } from '~/lib/trading/defaults';
import { cn } from '~/lib/utilities';

interface AssessmentDetailDialogProperties {
    onClose: () => void;
    row: null | TradeAssessmentRow;
}

export function AssessmentDetailDialog({
    onClose,
    row,
}: AssessmentDetailDialogProperties) {
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
                                                            <Badge
                                                                key={d}
                                                                variant="warning"
                                                            >
                                                                {d}
                                                            </Badge>
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
                            <Card
                                className={cn(
                                    'app-trade-checklist__red-flags',
                                    'border-l-4 border-l-rose-500',
                                )}
                            >
                                <CardHeader className="flex flex-row items-center justify-start gap-2">
                                    <ShieldAlert className="size-4 text-rose-500" />
                                    <CardTitle className="text-base">
                                        Red flags
                                    </CardTitle>
                                </CardHeader>
                                <Separator />
                                <CardContent>
                                    <ul
                                        className={cn(
                                            'app-trade-checklist__red-flags-list',
                                            'flex flex-col gap-2 text-sm',
                                        )}
                                    >
                                        {result.redFlags.map((f, index) => (
                                            <li
                                                className="flex items-start gap-2"
                                                key={index}
                                            >
                                                <ArrowRight className="mt-0.5 size-4 shrink-0 text-rose-500" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {result.strengths.length > 0 && (
                            <Card className="border-l-4 border-l-emerald-500">
                                <CardHeader className="flex flex-row items-center justify-start gap-2">
                                    <CheckCircle2 className="size-4 text-emerald-500" />
                                    <CardTitle className="text-base">
                                        Strengths
                                    </CardTitle>
                                </CardHeader>
                                <Separator />
                                <CardContent>
                                    <ul className="flex flex-col gap-2 text-sm">
                                        {result.strengths.map((s, index) => (
                                            <li
                                                className="flex items-start gap-2"
                                                key={index}
                                            >
                                                <ArrowRight className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                                <span>{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {result.weaknesses.length > 0 && (
                            <Card className="border-l-4 border-l-amber-500">
                                <CardHeader className="flex flex-row items-center justify-start gap-2">
                                    <AlertTriangle className="size-4 text-amber-500" />
                                    <CardTitle className="text-base">
                                        Weaknesses
                                    </CardTitle>
                                </CardHeader>
                                <Separator />
                                <CardContent>
                                    <ul className="flex flex-col gap-2 text-sm">
                                        {result.weaknesses.map((w, index) => (
                                            <li
                                                className="flex items-start gap-2"
                                                key={index}
                                            >
                                                <ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-500" />
                                                <span>{w}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {answers.finals.notes && (
                            <Card className="border-l-4 border-l-sky-500">
                                <CardHeader className="flex flex-row items-center justify-start gap-2">
                                    <NotebookPen className="size-4 text-sky-500" />
                                    <CardTitle className="text-base">
                                        Notes
                                    </CardTitle>
                                </CardHeader>
                                <Separator />
                                <CardContent>
                                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                                        {answers.finals.notes}
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
