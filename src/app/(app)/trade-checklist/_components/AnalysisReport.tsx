'use client';

import { motion } from 'framer-motion';
import { BookmarkCheck, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import type {
    Answers,
    AssessmentResult,
    Grade,
    Recommendation,
    TradeAssessmentRow,
    TradingPlanConfig,
} from '~/lib/trading/types';

import { RECOMMENDATION_LABEL } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { gradeTextClass } from '~/app/(app)/trade-checklist/_components/GradeTone';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { saveAssessment } from '~/lib/trading/actions';
import { WEIGHT_CATEGORIES } from '~/lib/trading/defaults';
import { cn } from '~/lib/utilities';

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
        () => comparableStats(result.grade, history),
        [result.grade, history],
    );
    const isRiskAllowed = result.suggestedSizeMultiplier > 0;
    const comparableRTone =
        comparable.avgR > 0 ? 'text-success' : 'text-destructive';

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
                            className={`type-display-section ${gradeTextClass(result.grade)}`}
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
                                        account: ${dollars.toLocaleString()}
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
                                    value: (
                                        <span
                                            className={
                                                isRiskAllowed
                                                    ? 'text-success'
                                                    : 'text-destructive'
                                            }
                                        >
                                            {isRiskAllowed
                                                ? `$${recommendedDollars.toLocaleString()}`
                                                : '$0'}
                                        </span>
                                    ),
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
                {WEIGHT_CATEGORIES.map(({ hint, key, label }) => {
                    const s = result.componentScores[key];
                    const pct =
                        s.max > 0 ? Math.min(100, (s.earned / s.max) * 100) : 0;
                    return (
                        <div
                            className="rounded-lg border border-border/60 p-3"
                            key={key}
                        >
                            <div className="flex items-baseline justify-between">
                                <p className="text-sm font-medium text-foreground">
                                    {label}
                                </p>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {s.earned.toFixed(1)} / {s.max}
                                </p>
                            </div>
                            <Progress className="mt-2" value={pct} />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                {s.note || hint}
                            </p>
                        </div>
                    );
                })}
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
                {comparable.sample >= 3 ? (
                    <StatStrip
                        items={[
                            {
                                id: 'sample',
                                label: 'Sample',
                                value: comparable.sample.toString(),
                            },
                            {
                                id: 'win-rate',
                                label: 'Win rate',
                                value: (
                                    <span
                                        className={
                                            comparable.winRate >= 0.55
                                                ? 'text-success'
                                                : undefined
                                        }
                                    >
                                        {`${(comparable.winRate * 100).toFixed(0)}%`}
                                    </span>
                                ),
                            },
                            {
                                id: 'avg-r',
                                label: 'Avg R',
                                value: (
                                    <span className={comparableRTone}>
                                        {`${comparable.avgR > 0 ? '+' : ''}${comparable.avgR.toFixed(2)}`}
                                    </span>
                                ),
                            },
                            {
                                id: 'expectancy',
                                label: 'Expectancy',
                                value: (
                                    <span className={comparableRTone}>
                                        {`${comparable.expectancy > 0 ? '+' : ''}${comparable.expectancy.toFixed(2)}R`}
                                    </span>
                                ),
                            },
                        ]}
                    />
                ) : (
                    <StatusRow
                        detail="Build the sample by saving and tagging outcomes."
                        title={`Not enough history at this grade yet (${String(comparable.sample)} recorded outcome${comparable.sample === 1 ? '' : 's'}).`}
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

function comparableStats(grade: Grade, history: TradeAssessmentRow[]) {
    const peers = history.filter(
        (h) => h.grade === grade && h.outcome !== null,
    );
    const sample = peers.length;
    if (sample === 0) {
        return { avgR: 0, expectancy: 0, sample, winRate: 0 };
    }
    const wins = peers.filter((p) => p.outcome === 'win').length;
    const winRate = wins / sample;
    const rs = peers
        .map((p) => p.outcomeR)
        .filter((r): r is number => typeof r === 'number');
    const avgR = rs.length > 0 ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
    return { avgR, expectancy: avgR, sample, winRate };
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
                : `Marginal setup: consider reduced size ($${sized.toLocaleString()} vs $${base.toLocaleString()} standard).`;
        }
        case 'skip': {
            return 'Skip this setup.';
        }
        case 'strong-take': {
            return `Take this trade at full risk ($${sized.toLocaleString()}).`;
        }
        case 'take': {
            return `Take this trade ($${sized.toLocaleString()}).`;
        }
    }
}
