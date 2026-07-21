import type { ReactNode } from 'react';

import { cn } from '~/lib/utilities';

import { TradeChecklistSubnav } from './_components/TradeChecklistSubnav';

export default function TradeChecklistLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <div className={cn('app-trade-checklist')}>
            <TradeChecklistSubnav />
            {children}
        </div>
    );
}
