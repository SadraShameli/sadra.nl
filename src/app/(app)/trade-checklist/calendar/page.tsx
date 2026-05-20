import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import type { LightAssessment } from '~/lib/trading-analytics';

import { auth } from '~/lib/auth';
import { routes } from '~/lib/routes';
import { ensureUserHasPlan } from '~/lib/trading-actions';
import { cn } from '~/lib/utils';
import { db, tradeAssessments } from '~/server/db';

import { CalendarView } from '../_components/CalendarView';

interface CalendarPageProps {
    searchParams: Promise<{ month?: string }>;
}

export const metadata: Metadata = {
    description:
        'Calendar heatmap of trading days plus current and best win/loss streak tracking.',
    title: 'Trade Calendar',
};

export const dynamic = 'force-dynamic';

export default async function TradeCalendarPage({
    searchParams,
}: CalendarPageProps) {
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);
    const userId = session.user.id;

    await ensureUserHasPlan();

    const sp = await searchParams;
    const month =
        sp.month && isValidMonth(sp.month) ? sp.month : defaultMonth();

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

    return (
        <main
            className={cn(
                'app-trade-checklist__calendar-view',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Calendar
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    Trading days at a glance. Click any day to drill into that
                    day&apos;s assessments in the journal.
                </p>
            </header>

            <CalendarView assessments={assessments} month={month} />
        </main>
    );
}

function defaultMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isValidMonth(s: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
