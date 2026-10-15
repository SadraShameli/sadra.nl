import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

import { AccountsCacheProvider } from './_components/AccountsCacheProvider';
import { AccountsSubnav } from './_components/AccountsSubnav';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Prop accounts',
};

export default function PropAccountsLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <div className={cn('app-prop-accounts')}>
            <AccountsSubnav />
            <AccountsCacheProvider>{children}</AccountsCacheProvider>
        </div>
    );
}
