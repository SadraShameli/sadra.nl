import { type ReactNode, Suspense } from 'react';

import { requireRootUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';

import { AccountingPageSkeleton } from './_components/AccountingSkeleton';
import { AccountingSubnav } from './_components/AccountingSubnav';

export const metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export default function AccountingLayout({
    children,
}: LayoutProps<'/accounting'>) {
    return (
        <div className={cn('app-accounting')}>
            <Suspense fallback={<AccountingPageSkeleton />}>
                <RootOnly>
                    <AccountingSubnav />
                    {children}
                </RootOnly>
            </Suspense>
        </div>
    );
}

async function RootOnly({ children }: { children: ReactNode }) {
    await requireRootUser();
    return children;
}
