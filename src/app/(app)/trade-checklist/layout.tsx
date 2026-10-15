import { type Instant } from 'next';

import { cn } from '~/lib/utilities';

import { TradeChecklistSubnav } from './_components/TradeChecklistSubnav';

export const instant: Instant = true;

export default function TradeChecklistLayout({
    children,
}: LayoutProps<'/trade-checklist'>) {
    return (
        <div className={cn('app-trade-checklist')}>
            <TradeChecklistSubnav />
            {children}
        </div>
    );
}
