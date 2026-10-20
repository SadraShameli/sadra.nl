'use client';

import { useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';

import { Tabs } from '~/components/ui/tabs';
import { PortfolioProjectNavigation } from '~/lib/site/PortfolioProjectNavigation';

const TABS_CLASS = 'flex min-w-0 flex-col gap-6';

export function PortfolioProjectTabs({
    children,
}: {
    readonly children: ReactNode;
}) {
    return (
        <Suspense
            fallback={
                <Tabs
                    className={TABS_CLASS}
                    defaultValue={PortfolioProjectNavigation.defaultProject}
                >
                    {children}
                </Tabs>
            }
        >
            <ProjectTabsAtQuery>{children}</ProjectTabsAtQuery>
        </Suspense>
    );
}

function ProjectTabsAtQuery({ children }: { readonly children: ReactNode }) {
    const parameters = useSearchParams();
    const selection = new PortfolioProjectNavigation(parameters.toString());

    return (
        <Tabs
            className={TABS_CLASS}
            onValueChange={(value) => {
                window.history.replaceState(
                    null,
                    '',
                    selection.href(PortfolioProjectNavigation.resolve(value)),
                );
            }}
            value={selection.selected()}
        >
            {children}
        </Tabs>
    );
}
