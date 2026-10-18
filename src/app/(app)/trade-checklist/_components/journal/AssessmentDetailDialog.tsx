'use client';

import type { TradeAssessmentRow } from '~/lib/trading/types';

import {
    EXECUTION_DEVIATION_LABEL,
    recommendationLabel,
} from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { ReasonListPanel } from '~/app/(app)/trade-checklist/_components/ReasonListPanel';
import { PanelSubheading } from '~/components/PanelSubheading';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
import { Progress } from '~/components/ui/progress';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Separator } from '~/components/ui/separator';
import { formatDisplayDateTime } from '~/lib/format';
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
                        <span className="font-serif text-3xl">{row.grade}</span>
                        <span className="font-mono text-sm text-muted-foreground">
                            {row.score.toFixed(1)} / 100
                        </span>
                        <Badge className="ml-auto">
                            {recommendationLabel(row.recommendation)}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    <div className="flex flex-col gap-4 pr-3">
                        <p className="text-xs text-muted-foreground">
                            {formatDisplayDateTime(row.createdAt)}
                            {windowLabel && ` · ${windowLabel}`}
                            {' · '}
                            {answers.context.accountType === 'funded'
                                ? 'Funded'
                                : 'Eval'}
                        </p>

                        {row.outcome && (
                            <div className="rounded-md border border-border/40 p-3">
                                <PanelSubheading>Outcome</PanelSubheading>
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
                                        <PanelSubheading as="h4">
                                            Execution
                                        </PanelSubheading>
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
                                                            <Badge key={d}>
                                                                {
                                                                    EXECUTION_DEVIATION_LABEL[
                                                                        d
                                                                    ]
                                                                }
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

                        <div className="flex flex-col gap-2">
                            <PanelSubheading>Component scores</PanelSubheading>
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
                            <ReasonListPanel
                                className="app-trade-checklist__red-flags"
                                items={result.redFlags}
                                title="Red flags"
                                titleAs="h3"
                            />
                        )}

                        {result.strengths.length > 0 && (
                            <ReasonListPanel
                                items={result.strengths}
                                title="Strengths"
                                titleAs="h3"
                            />
                        )}

                        {result.weaknesses.length > 0 && (
                            <ReasonListPanel
                                items={result.weaknesses}
                                title="Weaknesses"
                                titleAs="h3"
                            />
                        )}

                        {answers.finals.notes && (
                            <ToolPanel title="Notes" titleAs="h3">
                                <p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground">
                                    {answers.finals.notes}
                                </p>
                            </ToolPanel>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
