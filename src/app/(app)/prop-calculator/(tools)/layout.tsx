import { type ReactNode, Suspense } from 'react';

import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { RecentToolRecorder } from '~/app/(app)/prop-calculator/_components/hub/HubRecentTools';
import { LinkParameterNotice } from '~/app/(app)/prop-calculator/_components/LinkParameterNotice';
import { PropCalculatorSubnav } from '~/app/(app)/prop-calculator/_components/PropCalculatorSubnav';
import { ToolsPageSkeleton } from '~/app/(app)/prop-calculator/_components/ToolsSkeleton';

export default function PropCalculatorToolsLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <Suspense fallback={<ToolsPageSkeleton />}>
            <CalculatorProvider>
                <RecentToolRecorder />
                <PropCalculatorSubnav />
                <main className="app-prop-calculator container pt-spacing pb-24">
                    <LinkParameterNotice />
                    {children}
                </main>
            </CalculatorProvider>
        </Suspense>
    );
}
