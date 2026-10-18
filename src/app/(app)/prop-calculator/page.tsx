import { type Metadata } from 'next';

import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';
import { PageTransition } from '~/components/PageTransition';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

import { HubAccountsTeaser } from './_components/hub/HubAccountsTeaser';
import { HubRecentTools } from './_components/hub/HubRecentTools';
import { HubLegacySectionRedirect } from './_components/HubLegacySectionRedirect';
import { HubToolCards } from './_components/HubToolCards';
import { buildHubMetadata } from './_components/pageMetadata';

export const metadata: Metadata = buildHubMetadata();

export default function PropertyCalculatorPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-calculator',
                    'container pt-spacing pb-24',
                )}
            >
                <HubLegacySectionRedirect />
                <ToolPageHeader
                    eyebrow={siteToolTitle(ToolTicker.PropCalculator)}
                    lead={
                        <>
                            Pick a tool. The simulations run a Monte Carlo
                            against each firm&apos;s real drawdown, daily-loss,
                            and consistency rules. Your inputs carry over
                            between tools; pinned scenarios and lab results
                            reset when you leave the tools and come back here.
                        </>
                    }
                    title="Futures prop firms"
                />

                <HubRecentTools />
                <HubToolCards />
                <HubAccountsTeaser />
            </main>
        </PageTransition>
    );
}
