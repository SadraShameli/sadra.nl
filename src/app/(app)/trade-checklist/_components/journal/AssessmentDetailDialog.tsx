'use client';

import { Check, X } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import type { TradeAssessmentRow } from '~/lib/trading/types';

import {
    EXECUTION_DEVIATION_LABEL,
    OUTCOME_LABEL,
    recommendationLabel,
} from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import {
    ComponentScoreMeter,
    ComponentScoresNotScored,
    hasScoredComponents,
} from '~/app/(app)/trade-checklist/_components/ComponentScores';
import { ReasonList } from '~/app/(app)/trade-checklist/_components/ReasonListPanel';
import { PanelSubheading } from '~/components/PanelSubheading';
import { Badge } from '~/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Separator } from '~/components/ui/separator';
import {
    formatDisplayDateTime,
    formatWholeOrCentsCurrency,
} from '~/lib/format';
import { WEIGHT_CATEGORIES } from '~/lib/trading/defaults';
import { cn } from '~/lib/utilities';

interface AssessmentDetailDialogProperties {
    onClose: () => void;
    row: null | TradeAssessmentRow;
}

interface DialogSection {
    readonly content: ReactNode;
    readonly key: string;
    readonly title: string;
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
    const deviations = row.executionDeviations ?? [];
    const hasExecution =
        row.actualRiskTaken !== null ||
        row.followedPlan !== null ||
        deviations.length > 0;

    const sections: DialogSection[] = [
        ...(row.outcome === null
            ? []
            : [
                  {
                      content: (
                          <>
                              <p className="m-0 text-sm">
                                  {OUTCOME_LABEL[row.outcome]}
                                  {typeof row.outcomeR === 'number' &&
                                      ` · ${row.outcomeR > 0 ? '+' : ''}${row.outcomeR.toFixed(2)}R`}
                              </p>
                              {row.outcomeNotes && (
                                  <p className="m-0 text-sm text-muted-foreground">
                                      {row.outcomeNotes}
                                  </p>
                              )}
                          </>
                      ),
                      key: 'outcome',
                      title: 'Outcome',
                  },
              ]),
        ...(hasExecution
            ? [
                  {
                      content: (
                          <>
                              {row.actualRiskTaken !== null && (
                                  <p className="m-0 text-sm">
                                      Risked{' '}
                                      {formatWholeOrCentsCurrency(
                                          row.actualRiskTaken,
                                      )}
                                  </p>
                              )}
                              {row.followedPlan !== null && (
                                  <p className="m-0 flex items-center gap-1.5 text-sm">
                                      {row.followedPlan ? (
                                          <Check
                                              aria-hidden
                                              className="size-4 text-ink-muted"
                                          />
                                      ) : (
                                          <X
                                              aria-hidden
                                              className="size-4 text-ink-muted"
                                          />
                                      )}
                                      {row.followedPlan
                                          ? 'Followed plan'
                                          : 'Deviated from plan'}
                                  </p>
                              )}
                              {deviations.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                      {deviations.map((d) => (
                                          <Badge key={d}>
                                              {EXECUTION_DEVIATION_LABEL[d]}
                                          </Badge>
                                      ))}
                                  </div>
                              )}
                          </>
                      ),
                      key: 'execution',
                      title: 'Execution',
                  },
              ]
            : []),
        {
            content: hasScoredComponents(result.componentScores) ? (
                <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                    {WEIGHT_CATEGORIES.map((category) => (
                        <ComponentScoreMeter
                            key={category.key}
                            label={category.label}
                            score={result.componentScores[category.key]}
                        />
                    ))}
                </div>
            ) : (
                <ComponentScoresNotScored />
            ),
            key: 'components',
            title: 'Component scores',
        },
        ...reasonSection('red-flags', 'Red flags', result.redFlags),
        ...reasonSection('strengths', 'Strengths', result.strengths),
        ...reasonSection('weaknesses', 'Weaknesses', result.weaknesses),
        ...(answers.finals.notes
            ? [
                  {
                      content: (
                          <p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground">
                              {answers.finals.notes}
                          </p>
                      ),
                      key: 'notes',
                      title: 'Notes',
                  },
              ]
            : []),
    ];

    return (
        <Dialog onOpenChange={(open) => !open && onClose()} open>
            <DialogContent
                className={cn(
                    'app-trade-checklist__assessment-dialog',
                    'max-h-[90vh] sm:max-w-2xl',
                )}
            >
                <DialogHeader className="gap-2 pr-10">
                    <DialogTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                        <span className="font-serif text-3xl">{row.grade}</span>
                        <span className="font-mono text-sm text-muted-foreground">
                            {row.score.toFixed(1)} / 100
                        </span>
                        <Badge>{recommendationLabel(row.recommendation)}</Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {formatDisplayDateTime(row.createdAt)}
                        {windowLabel && ` · ${windowLabel}`}
                        {' · '}
                        {answers.context.accountType === 'funded'
                            ? 'Funded'
                            : 'Eval'}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    <div className="flex flex-col gap-4 pr-3">
                        {sections.map((section, index) => (
                            <Fragment key={section.key}>
                                {index > 0 && <Separator />}
                                <section className="flex flex-col gap-2">
                                    <PanelSubheading>
                                        {section.title}
                                    </PanelSubheading>
                                    {section.content}
                                </section>
                            </Fragment>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

function reasonSection(
    key: string,
    title: string,
    items: readonly string[],
): DialogSection[] {
    return items.length === 0
        ? []
        : [{ content: <ReasonList items={items} />, key, title }];
}
