import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { Suspense } from 'react';
import { z } from 'zod';

import { JournalView } from '~/app/(app)/trade-checklist/_components/JournalView';
import { TradeChecklistDataSkeleton } from '~/app/(app)/trade-checklist/_components/TradeChecklistDataSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { tradeAssessmentRowSchema } from '~/lib/schemas/trading';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { db, tradeAssessments, tradingPlans } from '~/server/db';

export const metadata: Metadata = {
    description:
        'Searchable, filterable history of every graded trade setup with mental-flag, window, and outcome filters.',
    title: 'Trade Journal',
};

export default function TradeJournalPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-trade-checklist__journal-view',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Journal
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                        Filter, search, and drill into every assessment you have
                        ever graded. Filter state lives in the URL so views are
                        shareable.
                    </p>
                </header>
                <Suspense fallback={<TradeChecklistDataSkeleton />}>
                    <TradeJournalContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function TradeJournalContent() {
    const user = await requireSessionUser(routes.auth.login);
    const userId = user.id;

    const [plans, rawRows] = await Promise.all([
        db
            .select({ id: tradingPlans.id, name: tradingPlans.name })
            .from(tradingPlans)
            .where(eq(tradingPlans.userId, userId)),
        db
            .select()
            .from(tradeAssessments)
            .where(eq(tradeAssessments.userId, userId))
            .orderBy(desc(tradeAssessments.createdAt)),
    ]);

    const history = z.array(tradeAssessmentRowSchema).parse(rawRows);

    return <JournalView history={history} plans={plans} />;
}
