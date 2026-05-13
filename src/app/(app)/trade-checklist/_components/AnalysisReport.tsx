'use client';

import { motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowRight,
    BookmarkCheck,
    CheckCircle2,
    RotateCcw,
    Save,
    Sparkles,
    XCircle,
} from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Progress } from '~/components/ui/Progress';
import { Separator } from '~/components/ui/Separator';
import { saveAssessment } from '~/lib/trading-actions';
import { WEIGHT_CATEGORIES } from '~/lib/trading-defaults';
import type {
    Answers,
    AssessmentResult,
    Grade,
    Recommendation,
    TradeAssessmentRow,
    TradingPlanRow,
    WeightCategory,
} from '~/lib/trading-types';
import { OutcomeDialog } from './OutcomeDialog';

const gradeColor: Record<Grade, string> = {
    'A+': 'text-emerald-400',
    A: 'text-emerald-400',
    'A-': 'text-emerald-300',
    'B+': 'text-emerald-300',
    B: 'text-amber-300',
    'B-': 'text-amber-300',
    'C+': 'text-amber-400',
    C: 'text-orange-400',
    'C-': 'text-orange-400',
    D: 'text-rose-500',
    F: 'text-rose-500',
};

const recoMeta: Record<
    Recommendation,
    { label: string; tone: 'success' | 'warning' | 'destructive' }
> = {
    'strong-take': { label: 'Strong take', tone: 'success' },
    take: { label: 'Take', tone: 'success' },
    marginal: { label: 'Marginal', tone: 'warning' },
    skip: { label: 'Skip', tone: 'destructive' },
    'hard-skip': { label: 'Hard skip', tone: 'destructive' },
};

const recoBadgeVariant: Record<
    'success' | 'warning' | 'destructive',
    'default' | 'destructive' | 'secondary' | 'outline'
> = {
    success: 'default',
    warning: 'secondary',
    destructive: 'destructive',
};

export function AnalysisReport({
    plan,
    answers,
    result,
    history,
    savedId,
    onSaved,
    onRestart,
}: {
    plan: TradingPlanRow;
    answers: Answers;
    result: AssessmentResult;
    history: TradeAssessmentRow[];
    savedId: string | null;
    onSaved: (id: string) => void;
    onRestart: () => void;
}) {
    const [savePending, startSave] = useTransition();
    const [outcomeOpen, setOutcomeOpen] = useState(false);
    const reco = recoMeta[result.recommendation];

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

    const persist = () => {
        if (savedId) return;
        startSave(async () => {
            const { id } = await saveAssessment({
                planId: plan.id,
                planSnapshot: plan.config,
                answers,
                result,
            });
            onSaved(id);
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
        >
            <Card className="overflow-hidden">
                <CardContent className="grid gap-8 md:grid-cols-[auto_1fr]">
                    <div className="flex flex-col items-center justify-center">
                        <motion.div
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 200 }}
                            className={`font-orbitron text-[6rem] leading-none font-bold tracking-tight ${gradeColor[result.grade]}`}
                        >
                            {result.grade}
                        </motion.div>
                        <div className="mt-2 font-mono text-sm text-muted-foreground">
                            {result.score.toFixed(1)} / 100
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Badge
                                variant={recoBadgeVariant[reco.tone]}
                                className="text-sm uppercase"
                            >
                                {reco.label}
                            </Badge>
                            <h2 className="mt-3 text-2xl font-semibold text-white">
                                {recommendationHeadline(
                                    result.recommendation,
                                    recommendedDollars,
                                    dollars,
                                )}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Plan: {plan.name} · Risk on this account: $
                                {dollars.toLocaleString()}
                            </p>
                        </div>

                        {result.suggestedSizeMultiplier > 0 ? (
                            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                                <p className="text-xs tracking-wider text-emerald-500 uppercase">
                                    Recommended risk
                                </p>
                                <p className="mt-1 font-mono text-3xl font-bold text-white">
                                    ${recommendedDollars.toLocaleString()}
                                </p>
                                <p className="mt-1 text-xs text-emerald-200/80">
                                    {(
                                        result.suggestedSizeMultiplier * 100
                                    ).toFixed(0)}
                                    % of standard plan risk.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
                                <p className="text-xs tracking-wider text-rose-500 uppercase">
                                    Recommended risk
                                </p>
                                <p className="mt-1 font-mono text-3xl font-bold text-white">
                                    $0
                                </p>
                                <p className="mt-1 text-xs text-rose-500">
                                    Do not trade this setup.
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {result.redFlags.length > 0 && (
                <Alert variant="destructive" persistent>
                    <AlertTriangle className="size-4" />
                    <AlertDescription>
                        <div className="font-medium">Red flags</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                            {result.redFlags.map((flag, i) => (
                                <li key={i}>{flag}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Scorecard</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    {WEIGHT_CATEGORIES.map(({ key, label, hint }) => {
                        const s = result.componentScores[key as WeightCategory];
                        const pct =
                            s.max > 0
                                ? Math.min(100, (s.earned / s.max) * 100)
                                : 0;
                        return (
                            <div
                                key={key}
                                className="rounded-lg border border-border/60 p-3"
                            >
                                <div className="flex items-baseline justify-between">
                                    <p className="text-sm font-medium text-white">
                                        {label}
                                    </p>
                                    <p className="font-mono text-xs text-muted-foreground">
                                        {s.earned.toFixed(1)} / {s.max}
                                    </p>
                                </div>
                                <Progress value={pct} className="mt-2" />
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {s.note || hint}
                                </p>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        <CardTitle className="text-base">
                            Why to take it
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        {result.strengths.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {result.strengths.map((s, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2"
                                    >
                                        <ArrowRight className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                        <span>{s}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No clear strengths identified.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-rose-500">
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                        <XCircle className="size-4 text-rose-500" />
                        <CardTitle className="text-base">
                            Why to skip it
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        {result.weaknesses.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {result.weaknesses.map((w, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2"
                                    >
                                        <ArrowRight className="mt-0.5 size-4 shrink-0 text-rose-500" />
                                        <span>{w}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No significant weaknesses detected.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {result.improvements.length > 0 && (
                <Card className="border-l-4 border-l-sky-500">
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                        <Sparkles className="size-4 text-sky-500" />
                        <CardTitle className="text-base">
                            How to upgrade this setup
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        <ul className="space-y-2 text-sm">
                            {result.improvements.map((imp, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-sky-400" />
                                    <span>{imp}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Hindsight at grade {result.grade}
                    </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent>
                    {comparable.sample >= 3 ? (
                        <div className="grid gap-3 sm:grid-cols-4">
                            <Stat
                                label="Sample"
                                value={comparable.sample.toString()}
                            />
                            <Stat
                                label="Win rate"
                                value={`${(comparable.winRate * 100).toFixed(0)}%`}
                                tone={
                                    comparable.winRate >= 0.55
                                        ? 'good'
                                        : undefined
                                }
                            />
                            <Stat
                                label="Avg R"
                                value={`${comparable.avgR > 0 ? '+' : ''}${comparable.avgR.toFixed(2)}`}
                                tone={comparable.avgR > 0 ? 'good' : 'bad'}
                            />
                            <Stat
                                label="Expectancy"
                                value={`${comparable.expectancy > 0 ? '+' : ''}${comparable.expectancy.toFixed(2)}R`}
                                tone={
                                    comparable.expectancy > 0 ? 'good' : 'bad'
                                }
                            />
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Not enough history at this grade yet (
                            {comparable.sample} recorded outcome
                            {comparable.sample === 1 ? '' : 's'}). Build the
                            sample by saving and tagging outcomes.
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
                <Button variant="ghost" onClick={onRestart}>
                    <RotateCcw className="mr-1 size-4" />
                    Restart
                </Button>
                {savedId ? (
                    <>
                        <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                        >
                            <BookmarkCheck className="mr-1 size-3" />
                            Saved
                        </Badge>
                        <Button onClick={() => setOutcomeOpen(true)}>
                            Record outcome
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="outline"
                            onClick={persist}
                            disabled={savePending}
                        >
                            <Save className="mr-1 size-4" />
                            Save assessment
                        </Button>
                        <Button
                            onClick={() => {
                                persist();
                                setOutcomeOpen(true);
                            }}
                            disabled={savePending}
                        >
                            Save &amp; record outcome
                        </Button>
                    </>
                )}
            </div>

            {savedId && (
                <OutcomeDialog
                    assessmentId={savedId}
                    open={outcomeOpen}
                    onOpenChange={setOutcomeOpen}
                />
            )}
        </motion.div>
    );
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone?: 'good' | 'bad';
}) {
    const color =
        tone === 'good'
            ? 'text-emerald-500'
            : tone === 'bad'
              ? 'text-rose-500'
              : 'text-white';

    return (
        <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs tracking-wider text-muted-foreground uppercase">
                {label}
            </p>
            <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>
                {value}
            </p>
        </div>
    );
}

function comparableStats(grade: Grade, history: TradeAssessmentRow[]) {
    const peers = history.filter(
        (h) => h.grade === grade && h.outcome !== null,
    );
    const sample = peers.length;
    if (sample === 0) {
        return { sample, winRate: 0, avgR: 0, expectancy: 0 };
    }
    const wins = peers.filter((p) => p.outcome === 'win').length;
    const winRate = wins / sample;
    const rs = peers
        .map((p) => p.outcomeR)
        .filter((r): r is number => typeof r === 'number');
    const avgR = rs.length > 0 ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
    return { sample, winRate, avgR, expectancy: avgR };
}

function recommendationHeadline(
    rec: Recommendation,
    sized: number,
    base: number,
): string {
    switch (rec) {
        case 'strong-take':
            return `Take this trade at full risk ($${sized.toLocaleString()}).`;
        case 'take':
            return `Take this trade ($${sized.toLocaleString()}).`;
        case 'marginal':
            if (sized === 0) return 'Sit this one out.';
            return `Marginal setup — consider reduced size ($${sized.toLocaleString()} vs $${base.toLocaleString()} standard).`;
        case 'skip':
            return 'Skip this setup.';
        case 'hard-skip':
            return 'Hard skip — do not trade.';
    }
}
