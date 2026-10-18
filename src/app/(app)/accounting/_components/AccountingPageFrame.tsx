import { type ReactNode, Suspense } from 'react';

import { SectionPageTabs } from '~/app/(app)/_components/SectionPageTabs';
import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { cn } from '~/lib/utilities';

import { AccountingDataSkeleton } from './AccountingDataSkeleton';
import {
    ACCOUNTING_EYEBROW,
    ACCOUNTING_NAV,
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
    const isSectionPage = page.backLink === undefined;
    return (
        <PageTransition>
            <main className={cn(className, 'container pt-spacing pb-24')}>
                <PageHeader
                    actions={actions}
                    backLink={page.backLink}
                    eyebrow={isSectionPage ? ACCOUNTING_EYEBROW : undefined}
                    lead={page.lead}
                    tabs={
                        isSectionPage ? (
                            <SectionPageTabs
                                items={ACCOUNTING_NAV}
                                label="Accounting pages"
                            />
                        ) : undefined
                    }
                    title={page.title}
                />
                <Suspense fallback={<AccountingDataSkeleton />}>
                    {children}
                </Suspense>
            </main>
        </PageTransition>
    );
}
