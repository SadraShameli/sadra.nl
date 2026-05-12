import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '~/lib/auth';
import { ensureUserHasPlan } from '~/lib/trading-actions';
import type { TradeAssessmentRow, TradingPlanRow } from '~/lib/trading-types';
import { db, tradeAssessments, tradingPlans } from '~/server/db';
import { ChecklistShell } from './_components/ChecklistShell';

export const metadata: Metadata = {
    title: 'Trade Checklist',
    description:
        'A pre-trade qualification checklist that scores your setup against your personal trading plan and returns a grade with a take/skip recommendation.',
};

export const dynamic = 'force-dynamic';

export default async function TradeChecklistPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');
    const userId = session.user.id;

    await ensureUserHasPlan();

    const plans = (await db
        .select()
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId))
        .orderBy(
            tradingPlans.sortOrder,
            desc(tradingPlans.updatedAt),
        )) as TradingPlanRow[];

    const history = (await db
        .select()
        .from(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId))
        .orderBy(desc(tradeAssessments.createdAt))
        .limit(50)) as TradeAssessmentRow[];

    const active = plans.find((p) => p.isActive) ?? plans[0]!;

    return (
        <main className="container pt-spacing pb-24">
            <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Trade Checklist
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                        Walk through your plan&apos;s entry criteria one section
                        at a time. The grader returns an A+→F rating, take/skip
                        recommendation, and journals the outcome for hindsight
                        analysis.
                    </p>
                </div>
            </header>

            <ChecklistShell
                activePlan={active}
                plans={plans}
                history={history}
            />
        </main>
    );
}
