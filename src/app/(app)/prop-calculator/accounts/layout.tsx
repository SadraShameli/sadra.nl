import { type Instant, type Metadata } from 'next';

import { cn } from '~/lib/utilities';

import { AccountsCacheProvider } from './_components/AccountsCacheProvider';
import { AccountsSubnav } from './_components/AccountsSubnav';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Prop accounts',
};

export const instant: Instant = true;

export default function PropAccountsLayout({
    children,
}: LayoutProps<'/prop-calculator/accounts'>) {
    return (
        <div className={cn('app-prop-accounts')}>
            <AccountsSubnav />
            <AccountsCacheProvider>{children}</AccountsCacheProvider>
        </div>
    );
}
