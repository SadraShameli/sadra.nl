import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import type { LightAssessment } from '~/lib/trading-analytics';

import { auth } from '~/lib/auth';
import { routes } from '~/lib/routes';
import { ensureUserHasPlan } from '~/lib/trading-actions';
import { cn } from '~/lib/utils';
import { db, tradeAssessments, tradingPlans } from '~/server/db';

import { AnalyticsDashboard } from '../_components/AnalyticsDashboard';

export const metadata: Metadata = {
    description:
        'Charts derived from your trade journal: win rate by grade, grade calibration, cumulative R, per-window performance, and component-score correlation.',
    title: 'Trade Analytics',
};

export const dynamic = 'force-dynamic';

export default async function TradeAnalyticsPage() {
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);
    const userId = session.user.id;

    await ensureUserHasPlan();

    const plans = await db
        .select({ id: tradingPlans.id, name: tradingPlans.name })
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId));

    const rows = await db
        .select({
            actualRiskTaken: tradeAssessments.actualRiskTaken,
            answers: tradeAssessments.answers,
            createdAt: tradeAssessments.createdAt,
            executionDeviations: tradeAssessments.executionDeviations,
            followedPlan: tradeAssessments.followedPlan,
            grade: tradeAssessments.grade,
            id: tradeAssessments.id,
            outcome: tradeAssessments.outcome,
            outcomeR: tradeAssessments.outcomeR,
            planId: tradeAssessments.planId,
            planSnapshot: tradeAssessments.planSnapshot,
            result: tradeAssessments.result,
            score: tradeAssessments.score,
        })
        .from(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId))
        .orderBy(desc(tradeAssessments.createdAt));

    const assessments: LightAssessment[] = rows.map((r) => ({
        actualRiskTaken: r.actualRiskTaken,
        componentScores: r.result.componentScores,
        createdAt: r.createdAt,
        executionDeviations: r.executionDeviations,
        followedPlan: r.followedPlan,
        grade: r.grade,
        id: r.id,
        outcome: r.outcome,
        outcomeR: r.outcomeR,
        planId: r.planId,
        planSnapshotWindows: r.planSnapshot.windows,
        score: r.score,
        setupType: r.answers.state.setupType,
        windowId: r.answers.context.windowId,
    }));

    return (
        <main
            className={cn(
                'app-trade-checklist__analytics-dashboard',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Analytics
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    Quantified hindsight on every graded setup. Filter by plan,
                    cross-check whether your grades actually predict outcomes,
                    and find which components and windows have edge.
                </p>
            </header>
            <AnalyticsDashboard assessments={assessments} plans={plans} />
        </main>
    );
}
