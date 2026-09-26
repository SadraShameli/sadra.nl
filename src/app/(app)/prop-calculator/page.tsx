import { type Metadata } from 'next';

import { cn } from '~/lib/utilities';

import { HubAccountsTeaser } from './_components/hub/HubAccountsTeaser';
import { HubRecentTools } from './_components/hub/HubRecentTools';
import { HubLegacySectionRedirect } from './_components/HubLegacySectionRedirect';
import { HubToolCards } from './_components/HubToolCards';
import { buildHubMetadata } from './_components/pageMetadata';

export const metadata: Metadata = buildHubMetadata();

export default function PropertyCalculatorPage() {
    return (
        <main
            className={cn('app-prop-calculator', 'container pt-spacing pb-24')}
        >
            <HubLegacySectionRedirect />
            <header className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Futures Prop Firm Calculator
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    Pick a tool. The simulations run a Monte Carlo against each
                    firm&apos;s real drawdown, daily-loss, and consistency
                    rules. Your inputs carry over between tools; pinned
                    scenarios and lab results reset when you leave the tools and
                    come back here.
                </p>
            </header>

            <HubRecentTools />
            <HubToolCards />
            <HubAccountsTeaser />
        </main>
    );
}
