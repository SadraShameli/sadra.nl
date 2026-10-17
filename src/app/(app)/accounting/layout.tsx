import { type Instant } from 'next';

import { cn } from '~/lib/utilities';

import { AccountingSubnav } from './_components/AccountingSubnav';

export const metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export const instant: Instant = true;

export default function AccountingLayout({
    children,
}: LayoutProps<'/accounting'>) {
    return (
        <div className={cn('app-accounting')}>
            <AccountingSubnav />
            {children}
        </div>
    );
}
