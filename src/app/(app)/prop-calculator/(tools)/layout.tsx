import { type ReactNode } from 'react';

import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { PropCalculatorSubnav } from '~/app/(app)/prop-calculator/_components/PropCalculatorSubnav';

export default function PropCalculatorToolsLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <CalculatorProvider>
            <PropCalculatorSubnav />
            <main className="app-prop-calculator container pt-spacing pb-24">
                {children}
            </main>
        </CalculatorProvider>
    );
}
