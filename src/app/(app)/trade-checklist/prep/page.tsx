import { and, desc, eq, gte } from 'drizzle-orm';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getServerSession } from '~/lib/auth/server';
import { dailyPreparationRowSchema } from '~/lib/schemas/trading';
import { routes } from '~/lib/site/routes';
import { ensureUserHasPlan } from '~/lib/trading/actions';
import { PLAN_TIMEZONE } from '~/lib/trading/defaults';
import { cn } from '~/lib/utils';
import { dailyPreparations, db, tradingPlans } from '~/server/db';

import { PrepView } from '../_components/PrepView';

export const metadata: Metadata = {
    description:
        'A daily pre-market preparation checklist with a discipline score and last-30-days history.',
    title: 'Pre-market Prep',
};

export const dynamic = 'force-dynamic';

export default async function PreMarketPrepPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    const userId = session.user.id;

    await ensureUserHasPlan();

    const today = todayInTz();
    const since = thirtyDaysAgo();

    const [plans, recent] = await Promise.all([
        db
            .select({ id: tradingPlans.id, name: tradingPlans.name })
            .from(tradingPlans)
            .where(eq(tradingPlans.userId, userId)),
        db
            .select()
            .from(dailyPreparations)
            .where(
                and(
                    eq(dailyPreparations.userId, userId),
                    gte(dailyPreparations.date, since),
                ),
            )
            .orderBy(desc(dailyPreparations.date)),
    ]);

    const history = z.array(dailyPreparationRowSchema).parse(recent);
    const activePlanId = plans[0]?.id ?? null;

    return (
        <main
            className={cn(
                'app-trade-checklist__prep-view',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Pre-market prep
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    The discipline gate before you ever pick up the mouse. Tick
                    off the prep you finished today and let the streak speak.
                </p>
            </header>

            <PrepView
                activePlanId={activePlanId}
                history={history}
                today={today}
            />
        </main>
    );
}

function thirtyDaysAgo(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: PLAN_TIMEZONE,
        year: 'numeric',
    }).format(d);
}

function todayInTz(): string {
    return new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: PLAN_TIMEZONE,
        year: 'numeric',
    }).format(new Date());
}
