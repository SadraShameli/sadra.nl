import { type ReactNode } from 'react';

import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { RecentToolRecorder } from '~/app/(app)/prop-calculator/_components/hub/HubRecentTools';
import { LinkParameterNotice } from '~/app/(app)/prop-calculator/_components/LinkParameterNotice';
import { PropCalculatorSubnav } from '~/app/(app)/prop-calculator/_components/PropCalculatorSubnav';

export default function PropCalculatorToolsLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <CalculatorProvider>
            <RecentToolRecorder />
            <PropCalculatorSubnav />
            <main className="app-prop-calculator container pt-spacing pb-24">
                <LinkParameterNotice />
                {children}
            </main>
        </CalculatorProvider>
    );
}
