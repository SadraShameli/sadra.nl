import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { Suspense } from 'react';
import { z } from 'zod';

import { JournalView } from '~/app/(app)/trade-checklist/_components/JournalView';
import { TradeChecklistDataSkeleton } from '~/app/(app)/trade-checklist/_components/TradeChecklistDataSkeleton';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { tradeAssessmentRowSchema } from '~/lib/schemas/tradingRows';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';
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
                <PageHeader
                    eyebrow={siteToolTitle(ToolTicker.Checklist)}
                    lead="Filter, search, and drill into every assessment you have ever graded."
                    title="Journal"
                />
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
