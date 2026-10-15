import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { Suspense } from 'react';
import { z } from 'zod';

import { TradeChecklistDataSkeleton } from '~/app/(app)/trade-checklist/_components/TradeChecklistDataSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { tradeAssessmentRowSchema } from '~/lib/schemas/trading';
import { routes } from '~/lib/site/routes';
import { loadTradingPlans } from '~/lib/trading/loadTradingPlans';
import { cn } from '~/lib/utilities';
import { db, tradeAssessments } from '~/server/db';

import { ChecklistShell } from './_components/ChecklistShell';
import { DefaultTradingPlanSetup } from './_components/DefaultTradingPlanSetup';

export const metadata: Metadata = {
    description:
        'A pre-trade qualification checklist that scores your setup against your personal trading plan and returns a grade with a take/skip recommendation.',
    title: 'Trade Checklist',
};

export default function TradeChecklistPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-trade-checklist__hub',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Trade Checklist
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                            Walk through your plan&apos;s entry criteria one
                            section at a time. The grader returns an A+→F
                            rating, take/skip recommendation, and journals the
                            outcome for hindsight analysis.
                        </p>
                    </div>
                </header>
                <Suspense fallback={<TradeChecklistDataSkeleton />}>
                    <TradeChecklistContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function TradeChecklistContent() {
    const user = await requireSessionUser(routes.auth.login);
    const userId = user.id;

    const plans = await loadTradingPlans(userId);

    const historyRows = await db
        .select()
        .from(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId))
        .orderBy(desc(tradeAssessments.createdAt))
        .limit(50);

    const history = z.array(tradeAssessmentRowSchema).parse(historyRows);

    const active = plans.find((p) => p.isActive) ?? plans[0];
    return active ? (
        <ChecklistShell activePlan={active} history={history} plans={plans} />
    ) : (
        <DefaultTradingPlanSetup />
    );
}
