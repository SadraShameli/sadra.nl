import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { Suspense } from 'react';

import type { LightAssessment } from '~/lib/trading/analytics';

import { CalendarView } from '~/app/(app)/trade-checklist/_components/CalendarView';
import { TradeChecklistDataSkeleton } from '~/app/(app)/trade-checklist/_components/TradeChecklistDataSkeleton';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { db, tradeAssessments } from '~/server/db';

export const metadata: Metadata = {
    description:
        'Calendar heatmap of trading days plus current and best win/loss streak tracking.',
    title: 'Trade Calendar',
};

export default function TradeCalendarPage({
    searchParams,
}: PageProps<'/trade-checklist/calendar'>) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-trade-checklist__calendar-view',
                    'container pt-spacing pb-24',
                )}
            >
                <PageHeader
                    eyebrow={siteToolTitle(ToolTicker.Checklist)}
                    lead={
                        <>
                            Trading days at a glance. Click any day to drill
                            into that day&apos;s assessments in the journal.
                        </>
                    }
                    title="Calendar"
                />
                <Suspense fallback={<TradeChecklistDataSkeleton />}>
                    <TradeCalendarContent searchParams={searchParams} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

function defaultMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isValidMonth(s: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

async function TradeCalendarContent({
    searchParams,
}: Pick<PageProps<'/trade-checklist/calendar'>, 'searchParams'>) {
    const user = await requireSessionUser(routes.auth.login);
    const userId = user.id;

    const { month: requestedMonth } = await searchParams;
    const month =
        typeof requestedMonth === 'string' && isValidMonth(requestedMonth)
            ? requestedMonth
            : defaultMonth();

    const rows = await db
        .select({
            answers: tradeAssessments.answers,
            createdAt: tradeAssessments.createdAt,
            grade: tradeAssessments.grade,
            id: tradeAssessments.id,
            outcome: tradeAssessments.outcome,
            outcomeR: tradeAssessments.outcomeR,
            planId: tradeAssessments.planId,
            planSnapshot: tradeAssessments.planSnapshot,
            score: tradeAssessments.score,
        })
        .from(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId))
        .orderBy(desc(tradeAssessments.createdAt));

    const assessments: LightAssessment[] = rows.map((r) => ({
        createdAt: r.createdAt,
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

    return <CalendarView assessments={assessments} month={month} />;
}
