import type { ReactNode } from 'react';

import { TradeChecklistSubnav } from './_components/TradeChecklistSubnav';

export default function TradeChecklistLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <>
            <TradeChecklistSubnav />
            {children}
        </>
    );
}
