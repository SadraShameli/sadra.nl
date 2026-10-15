import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
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

export default function PropRulebookPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__rulebook',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description="The documented rules the sizing suggester will use as its headline. Every value that differs from the skill is listed, with a preview of the custom rule label that headline will carry."
                    title="Rulebook"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropRulebookContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropRulebookContent() {
    const user = await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.rulebook),
    );
    await api.propAccounts.rulebook.get.prefetch();
    const tradingPlan = tradingPlanSourceFrom(
        await loadActiveTradingPlan(user.id),
    );
    return (
        <HydrateClient>
            <RulebookView tradingPlan={tradingPlan} />
        </HydrateClient>
    );
}
