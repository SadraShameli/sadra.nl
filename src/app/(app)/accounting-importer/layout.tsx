import type { ReactNode } from 'react';

import { notFound, redirect } from 'next/navigation';

import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';

import { AccountingImporterSubnav } from './_components/AccountingImporterSubnav';

export const metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export default async function AccountingImporterLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    if (!isRoot(session.user.role)) notFound();

    return (
        <div className={cn('app-accounting-importer')}>
            <AccountingImporterSubnav />
            {children}
        </div>
    );
}
