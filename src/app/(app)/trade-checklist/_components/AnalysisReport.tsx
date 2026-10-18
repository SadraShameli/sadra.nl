'use client';

import { motion } from 'framer-motion';
import { BookmarkCheck, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import type {
    Answers,
    AssessmentResult,
    Recommendation,
    TradeAssessmentRow,
    TradingPlanConfig,
} from '~/lib/trading/types';

import {
    expectancyStat,
    outcomeCount,
} from '~/app/(app)/trade-checklist/_components/analytics/outcomeStats';
import { RECOMMENDATION_LABEL } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
    formatCurrency,
    formatPercent,
    formatWholeOrCentsCurrency,
} from '~/lib/format';
import { saveAssessment } from '~/lib/trading/actions';
import { outcomeTally } from '~/lib/trading/analytics';
import { WEIGHT_CATEGORIES } from '~/lib/trading/defaults';
import { cn } from '~/lib/utilities';

import {
    ComponentScoreMeter,
    ComponentScoresNotScored,
    hasScoredComponents,
} from './ComponentScores';
import { OutcomeDialog } from './OutcomeDialog';
import { ReasonListPanel } from './ReasonListPanel';

export interface ReportPlan {
    readonly config: TradingPlanConfig;
    readonly id: null | string;
    readonly name: string;
}

const RECOMMENDATION_TONE: Record<Recommendation, StatusTone> = {
    'hard-skip': StatusTone.Fail,
    marginal: StatusTone.Warn,
    skip: StatusTone.Fail,
    'strong-take': StatusTone.Pass,
    take: StatusTone.Pass,
};

export function AnalysisReport({
    answers,
    history,
    onRestart,
    onSaved,
    plan,
    result,
    savedId,
}: {
    answers: Answers;
    history: TradeAssessmentRow[];
    onRestart: () => void;
    onSaved: (id: string) => void;
    plan: ReportPlan;
    result: AssessmentResult;
    savedId: null | string;
}) {
    const [savePending, startSave] = useTransition();
    const [outcomeOpen, setOutcomeOpen] = useState(false);

    const dollars =
        answers.context.accountType === 'funded'
            ? plan.config.risk.fundedDollars
            : plan.config.risk.evalDollars;
    const recommendedDollars = Math.round(
        dollars * result.suggestedSizeMultiplier,
    );

    const comparable = useMemo(
        () => outcomeTally(history.filter((h) => h.grade === result.grade)),
        [result.grade, history],
    );
    const isRiskAllowed = result.suggestedSizeMultiplier > 0;

    const persist = (onComplete?: () => void) => {
        if (savedId) {
            onComplete?.();
            return;
        }
        startSave(async () => {
            const { id } = await saveAssessment({
                answers,
                planId: plan.id,
                planSnapshot: plan.config,
                result,
            });
            onSaved(id);
            onComplete?.();
        });
    };

    return (
        <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'app-trade-checklist__analysis-report',
                'flex flex-col gap-6',
            )}
            initial={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
        >
            <Card className="overflow-hidden">
                <CardContent className="grid gap-8 md:grid-cols-[auto_1fr]">
                    <div className="flex flex-col items-center justify-center">
                        <motion.div
                            animate={{ opacity: 1, scale: 1 }}
                            className="type-display-section text-ink"
                            initial={{ opacity: 0, scale: 0.6 }}
                            transition={{ stiffness: 200, type: 'spring' }}
                        >
                            {result.grade}
                        </motion.div>
                        <div className="mt-2 font-mono text-sm text-muted-foreground">
                            {result.score.toFixed(1)} / 100
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col items-start gap-3">
                            <Badge className="text-sm uppercase">
                                {RECOMMENDATION_LABEL[result.recommendation]}
                            </Badge>
                            <StatusRow
                                className="w-full"
                                detail={
                                    <>
                                        Plan: {plan.name} · Risk on this
                                        account:{' '}
                                        {formatWholeOrCentsCurrency(dollars)}
                                    </>
                                }
                                title={recommendationHeadline(
                                    result.recommendation,
                                    recommendedDollars,
                                    dollars,
                                )}
                                tone={
                                    RECOMMENDATION_TONE[result.recommendation]
                                }
                            />
                        </div>

                        <StatStrip
                            items={[
                                {
                                    caption: isRiskAllowed
                                        ? `${(
                                              result.suggestedSizeMultiplier *
                                              100
                                          ).toFixed(0)}% of standard plan risk.`
                                        : 'Do not trade this setup.',
                                    id: 'recommended-risk',
                                    label: 'Recommended risk',
                                    value: formatCurrency(recommendedDollars),
                                },
                            ]}
                            size={StatStripSize.Large}
                        />

                        {result.redFlags.map((flag, index) => (
                            <StatusRow
                                key={index}
                                title={flag}
                                tone={
                                    isRiskAllowed
                                        ? StatusTone.Warn
                                        : StatusTone.Fail
                                }
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>

            <ToolPanel
                contentClassName="grid gap-4 md:grid-cols-2"
                title="Scorecard"
            >
                {hasScoredComponents(result.componentScores) ? (
                    WEIGHT_CATEGORIES.map(({ hint, key, label }) => (
                        <div
                            className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3"
                            key={key}
                        >
                            <ComponentScoreMeter
                                label={label}
                                score={result.componentScores[key]}
                            />
                            <p className="m-0 text-xs text-muted-foreground">
                                {result.componentScores[key].note || hint}
                            </p>
                        </div>
                    ))
                ) : (
                    <div className="md:col-span-2">
                        <ComponentScoresNotScored />
                    </div>
                )}
            </ToolPanel>

            <div className="grid gap-4 md:grid-cols-2">
                <ReasonListPanel
                    className="app-trade-checklist__strengths"
                    emptyText="No clear strengths identified."
                    items={result.strengths}
                    title="Why to take it"
                />

                <ReasonListPanel
                    className="app-trade-checklist__weaknesses"
                    emptyText="No significant weaknesses detected."
                    items={result.weaknesses}
                    title="Why to skip it"
                />
            </div>

            {result.improvements.length > 0 && (
                <ReasonListPanel
                    items={result.improvements}
                    title="How to upgrade this setup"
                />
            )}

            <ToolPanel title={`Hindsight at grade ${result.grade}`}>
                {comparable.outcomes >= 3 ? (
                    <StatStrip
                        items={[
                            {
                                caption: `${String(comparable.withR)} with R`,
                                id: 'sample',
                                label: 'Sample',
                                value: String(comparable.outcomes),
                            },
                            {
                                id: 'win-rate',
                                label: 'Win rate',
                                value: formatPercent(comparable.winRate, 0),
                            },
                            expectancyStat(comparable),
                        ]}
                    />
                ) : (
                    <StatusRow
                        detail="Build the sample by saving and tagging outcomes."
                        title={`Not enough history at this grade yet (${outcomeCount(comparable.outcomes)} recorded).`}
                        tone={StatusTone.Neutral}
                    />
                )}
            </ToolPanel>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
                <Button onClick={onRestart} variant="ghost">
                    <RotateCcw data-icon="inline-start" />
                    Restart
                </Button>
                {savedId ? (
                    <>
                        <Button disabled variant="outline">
                            <BookmarkCheck data-icon="inline-start" />
                            Saved
                        </Button>
                        <Button onClick={() => setOutcomeOpen(true)}>
                            Record outcome
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            disabled={savePending}
                            onClick={() => persist()}
                            variant="outline"
                        >
                            <Save data-icon="inline-start" />
                            Save assessment
                        </Button>
                        <Button
                            disabled={savePending}
                            onClick={() => persist(() => setOutcomeOpen(true))}
                        >
                            Save &amp; record outcome
                        </Button>
                    </>
                )}
            </div>

            {savedId && (
                <OutcomeDialog
                    assessmentId={savedId}
                    onOpenChange={setOutcomeOpen}
                    open={outcomeOpen}
                    saved={history.find((row) => row.id === savedId) ?? null}
                />
            )}
        </motion.div>
    );
}

function recommendationHeadline(
    rec: Recommendation,
    sized: number,
    base: number,
): string {
    switch (rec) {
        case 'hard-skip': {
            return 'Hard skip: do not trade.';
        }
        case 'marginal': {
            return sized === 0
                ? 'Sit this one out.'
                : `Marginal setup: consider reduced size (${formatCurrency(sized)} vs ${formatWholeOrCentsCurrency(base)} standard).`;
        }
        case 'skip': {
            return 'Skip this setup.';
        }
        case 'strong-take': {
            return `Take this trade at full risk (${formatCurrency(sized)}).`;
        }
        case 'take': {
            return `Take this trade (${formatCurrency(sized)}).`;
        }
    }
}
