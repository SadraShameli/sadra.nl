import { and, desc, eq, gte } from 'drizzle-orm';
import { type Metadata } from 'next';
import { Suspense } from 'react';
import { z } from 'zod';

import { DefaultTradingPlanSetup } from '~/app/(app)/trade-checklist/_components/DefaultTradingPlanSetup';
import { PrepView } from '~/app/(app)/trade-checklist/_components/PrepView';
import { TradeChecklistDataSkeleton } from '~/app/(app)/trade-checklist/_components/TradeChecklistDataSkeleton';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { dailyPreparationRowSchema } from '~/lib/schemas/tradingRows';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { dateKey } from '~/lib/trading/analytics';
import { loadActiveTradingPlan } from '~/lib/trading/loadActiveTradingPlan';
import { cn } from '~/lib/utilities';
import { dailyPreparations, db } from '~/server/db';

export const metadata: Metadata = {
    description:
        'A daily pre-market preparation checklist with a discipline score and last-30-days history.',
    title: 'Pre-market Prep',
};

export default function PreMarketPrepPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-trade-checklist__prep-view',
                    'container pt-spacing pb-24',
                )}
            >
                <PageHeader
                    eyebrow={siteToolTitle(ToolTicker.Checklist)}
                    lead={
                        <>
                            The discipline gate before you ever pick up the
                            mouse. Tick off the prep you finished today and let
                            the streak speak.
                        </>
                    }
                    title="Pre-market prep"
                />
                <Suspense fallback={<TradeChecklistDataSkeleton />}>
                    <PreMarketPrepContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PreMarketPrepContent() {
    const user = await requireSessionUser(routes.auth.login);
    const userId = user.id;

    const today = dateKey(new Date());
    const since = thirtyDaysAgo();

    const recentPrepCondition = and(
        eq(dailyPreparations.userId, userId),
        gte(dailyPreparations.date, since),
    );

    const [activePlan, recent] = await Promise.all([
        loadActiveTradingPlan(userId),
        db
            .select()
            .from(dailyPreparations)
            .where(recentPrepCondition)
            .orderBy(desc(dailyPreparations.date)),
    ]);

    if (!activePlan) return <DefaultTradingPlanSetup />;

    const history = z.array(dailyPreparationRowSchema).parse(recent);

    return (
        <PrepView
            activePlanId={activePlan.id}
            history={history}
            today={today}
        />
    );
}

function thirtyDaysAgo(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return dateKey(d);
}
