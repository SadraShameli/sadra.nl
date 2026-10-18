import { type ReactNode, type Ref } from 'react';

import { SectionPageTabs } from '~/app/(app)/_components/SectionPageTabs';
import { PageHeader } from '~/components/PageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

import { ACCOUNTS_NAV_ITEMS } from './accountsNavItems';

export function AccountsPageHeader({
    action,
    description,
    title,
    titleReference,
}: {
    readonly action?: ReactNode;
    readonly description?: ReactNode;
    readonly title: string;
    readonly titleReference?: Ref<HTMLHeadingElement>;
}) {
    return (
        <PageHeader
            actions={action}
            eyebrow={siteToolTitle(ToolTicker.PropCalculator)}
            lead={description}
            tabs={
                <SectionPageTabs
                    items={ACCOUNTS_NAV_ITEMS}
                    label="Prop accounts pages"
                />
            }
            title={title}
            titleReference={titleReference}
        />
    );
}
