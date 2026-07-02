'use client';

import { motion } from 'framer-motion';
import {
    ArrowRight,
    BookmarkCheck,
    CheckCircle2,
    RotateCcw,
    Save,
    Sparkles,
    XCircle,
} from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import type {
    Answers,
    AssessmentResult,
    Grade,
    Recommendation,
    TradeAssessmentRow,
    TradingPlanRow,
} from '~/lib/trading/types';

import Eyebrow from '~/components/Eyebrow';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Progress } from '~/components/ui/Progress';
import { Separator } from '~/components/ui/Separator';
import { saveAssessment } from '~/lib/trading/actions';
import { WEIGHT_CATEGORIES } from '~/lib/trading/defaults';
import { cn } from '~/lib/utils';

import { OutcomeDialog } from './OutcomeDialog';

const gradeColor: Record<Grade, string> = {
    A: 'text-emerald-400',
    'A+': 'text-emerald-400',
    'A-': 'text-emerald-300',
    B: 'text-amber-300',
    'B+': 'text-emerald-300',
    'B-': 'text-amber-300',
    C: 'text-orange-400',
    'C+': 'text-amber-400',
    'C-': 'text-orange-400',
    D: 'text-rose-500',
    F: 'text-rose-500',
};

const recoMeta: Record<
    Recommendation,
    { label: string; tone: 'destructive' | 'success' | 'warning' }
> = {
    'hard-skip': { label: 'Hard skip', tone: 'destructive' },
    marginal: { label: 'Marginal', tone: 'warning' },
    skip: { label: 'Skip', tone: 'destructive' },
    'strong-take': { label: 'Strong take', tone: 'success' },
    take: { label: 'Take', tone: 'success' },
};

const recoBadgeVariant: Record<
    'destructive' | 'success' | 'warning',
    'default' | 'destructive' | 'outline' | 'secondary'
> = {
    destructive: 'destructive',
    success: 'default',
    warning: 'secondary',
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
    plan: TradingPlanRow;
    result: AssessmentResult;
    savedId: null | string;
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
                            className={`font-orbitron text-[6rem] leading-none font-bold tracking-tight ${gradeColor[result.grade]}`}
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
                        <div>
                            <Badge
                                className="text-sm uppercase"
                                variant={recoBadgeVariant[reco.tone]}
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
                            <Alert variant="success">
                                <AlertTitle className="text-xs tracking-wider uppercase">
                                    Recommended risk
                                </AlertTitle>
                                <AlertDescription className="flex flex-col gap-1">
                                    <span className="font-mono text-3xl font-bold text-foreground">
                                        ${recommendedDollars.toLocaleString()}
                                    </span>
                                    <span className="text-xs opacity-80">
                                        {(
                                            result.suggestedSizeMultiplier * 100
                                        ).toFixed(0)}
                                        % of standard plan risk.
                                    </span>
                                    {result.redFlags.length > 0 && (
                                        <ul className="mt-3 flex flex-col gap-1 border-t border-current/20 pt-3">
                                            {result.redFlags.map(
                                                (flag, index) => (
                                                    <li
                                                        className="text-xs"
                                                        key={index}
                                                    >
                                                        · {flag}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    )}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <Alert variant="destructive">
                                <AlertTitle className="text-xs tracking-wider uppercase">
                                    Recommended risk
                                </AlertTitle>
                                <AlertDescription className="flex flex-col gap-1">
                                    <span className="font-mono text-3xl font-bold text-foreground">
                                        $0
                                    </span>
                                    <span className="text-xs">
                                        Do not trade this setup.
                                    </span>
                                    {result.redFlags.length > 0 && (
                                        <ul className="mt-3 flex flex-col gap-1 border-t border-current/20 pt-3">
                                            {result.redFlags.map(
                                                (flag, index) => (
                                                    <li
                                                        className="text-xs"
                                                        key={index}
                                                    >
                                                        · {flag}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Scorecard</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-4 md:grid-cols-2">
                    {WEIGHT_CATEGORIES.map(({ hint, key, label }) => {
                        const s = result.componentScores[key];
                        const pct =
                            s.max > 0
                                ? Math.min(100, (s.earned / s.max) * 100)
                                : 0;
                        return (
                            <div
                                className="rounded-lg border border-border/60 p-3"
                                key={key}
                            >
                                <div className="flex items-baseline justify-between">
                                    <p className="text-sm font-medium text-white">
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
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader className="flex flex-row items-center justify-start gap-2">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        <CardTitle className="text-base">
                            Why to take it
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        {result.strengths.length > 0 ? (
                            <ul
                                className={cn(
                                    'app-trade-checklist__strengths-list',
                                    'flex flex-col gap-2 text-sm',
                                )}
                            >
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
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No clear strengths identified.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-rose-500">
                    <CardHeader className="flex flex-row items-center justify-start gap-2">
                        <XCircle className="size-4 text-rose-500" />
                        <CardTitle className="text-base">
                            Why to skip it
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        {result.weaknesses.length > 0 ? (
                            <ul
                                className={cn(
                                    'app-trade-checklist__weaknesses-list',
                                    'flex flex-col gap-2 text-sm',
                                )}
                            >
                                {result.weaknesses.map((w, index) => (
                                    <li
                                        className="flex items-start gap-2"
                                        key={index}
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
                    <CardHeader className="flex flex-row items-center justify-start gap-2">
                        <Sparkles className="size-4 text-sky-500" />
                        <CardTitle className="text-base">
                            How to upgrade this setup
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        <ul className="flex flex-col gap-2 text-sm">
                            {result.improvements.map((imp, index) => (
                                <li
                                    className="flex items-start gap-2"
                                    key={index}
                                >
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
                                tone={
                                    comparable.winRate >= 0.55
                                        ? 'good'
                                        : undefined
                                }
                                value={`${(comparable.winRate * 100).toFixed(0)}%`}
                            />
                            <Stat
                                label="Avg R"
                                tone={comparable.avgR > 0 ? 'good' : 'bad'}
                                value={`${comparable.avgR > 0 ? '+' : ''}${comparable.avgR.toFixed(2)}`}
                            />
                            <Stat
                                label="Expectancy"
                                tone={
                                    comparable.expectancy > 0 ? 'good' : 'bad'
                                }
                                value={`${comparable.expectancy > 0 ? '+' : ''}${comparable.expectancy.toFixed(2)}R`}
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
                <Button onClick={onRestart} variant="ghost">
                    <RotateCcw className="mr-1 size-4" />
                    Restart
                </Button>
                {savedId ? (
                    <>
                        <Badge
                            className="font-mono text-xs"
                            variant="secondary"
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
                            disabled={savePending}
                            onClick={() => persist()}
                            variant="outline"
                        >
                            <Save className="mr-1 size-4" />
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
            return 'Hard skip — do not trade.';
        }
        case 'marginal': {
            if (sized === 0) return 'Sit this one out.';
            return `Marginal setup — consider reduced size ($${sized.toLocaleString()} vs $${base.toLocaleString()} standard).`;
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

function Stat({
    label,
    tone,
    value,
}: {
    label: string;
    tone?: 'bad' | 'good';
    value: string;
}) {
    const color =
        tone === 'good'
            ? 'text-emerald-500'
            : tone === 'bad'
              ? 'text-rose-500'
              : 'text-white';

    return (
        <div className="rounded-lg border border-border/60 p-3">
            <Eyebrow as="p">{label}</Eyebrow>
            <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>
                {value}
            </p>
        </div>
    );
}
