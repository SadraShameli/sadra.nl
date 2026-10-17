import { type ReactNode, Suspense } from 'react';

import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';
import { PageTransition } from '~/components/PageTransition';
import { cn } from '~/lib/utilities';

import { AccountingDataSkeleton } from './AccountingDataSkeleton';
import {
    ACCOUNTING_EYEBROW,
    type AccountingSection,
    accountingSectionPage,
} from './AccountingSection';

export function AccountingPageFrame({
    actions,
    children,
    className,
    section,
}: {
    readonly actions?: ReactNode;
    readonly children: ReactNode;
    readonly className: string;
    readonly section: AccountingSection;
}) {
    const page = accountingSectionPage(section);
    return (
        <PageTransition>
            <main className={cn(className, 'container pt-spacing pb-24')}>
                <ToolPageHeader
                    actions={actions}
                    eyebrow={ACCOUNTING_EYEBROW}
                    lead={page.lead}
                    title={page.title}
                />
                <Suspense fallback={<AccountingDataSkeleton />}>
                    {children}
                </Suspense>
            </main>
        </PageTransition>
    );
}
