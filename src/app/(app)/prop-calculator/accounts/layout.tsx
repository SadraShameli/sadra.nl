import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { type ReactNode } from 'react';

import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { AccountsCacheProvider } from './_components/AccountsCacheProvider';
import { AccountsSubnav } from './_components/AccountsSubnav';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Prop accounts',
};

export default async function PropAccountsLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.index));
    }

    return (
        <div className={cn('app-prop-accounts')}>
            <AccountsSubnav />
            <AccountsCacheProvider>{children}</AccountsCacheProvider>
        </div>
    );
}
