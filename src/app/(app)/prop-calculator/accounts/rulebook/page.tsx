import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { loadActiveTradingPlan } from '~/lib/trading/loadActiveTradingPlan';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { tradingPlanSourceFrom } from './rulebookFromTradingPlan';
import { RulebookView } from './RulebookView';

export const metadata: Metadata = {
    description:
        'Your documented sizing and payout rules, and every place they differ from the skill.',
    title: 'Rulebook',
};

export const dynamic = 'force-dynamic';

export default async function PropRulebookPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.rulebook));
    }
    void api.propAccounts.rulebook.get.prefetch();
    const tradingPlan = tradingPlanSourceFrom(
        await loadActiveTradingPlan(session.user.id),
    );
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__rulebook',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Rulebook
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
                        The documented rules the sizing suggester will use as
                        its headline. Every value that differs from the skill is
                        listed, with a preview of the custom rule label that
                        headline will carry.
                    </p>
                </header>
                <RulebookView tradingPlan={tradingPlan} />
            </main>
        </HydrateClient>
    );
}
