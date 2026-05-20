import { desc, eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '~/lib/auth/config';
import { tradeAssessmentRowSchema } from '~/lib/schemas/trading';
import { routes } from '~/lib/site/routes';
import { ensureUserHasPlan } from '~/lib/trading/actions';
import { cn } from '~/lib/utils';
import { db, tradeAssessments, tradingPlans } from '~/server/db';

import { JournalView } from '../_components/JournalView';

export const metadata: Metadata = {
    description:
        'Searchable, filterable history of every graded trade setup with mental-flag, window, and outcome filters.',
    title: 'Trade Journal',
};

export const dynamic = 'force-dynamic';

export default async function TradeJournalPage() {
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);
    const userId = session.user.id;

    await ensureUserHasPlan();

    const plans = await db
        .select({ id: tradingPlans.id, name: tradingPlans.name })
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId));

    const rawRows = await db
        .select()
        .from(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId))
        .orderBy(desc(tradeAssessments.createdAt));

    const history = z.array(tradeAssessmentRowSchema).parse(rawRows);

    return (
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

            <JournalView history={history} plans={plans} />
        </main>
    );
}
