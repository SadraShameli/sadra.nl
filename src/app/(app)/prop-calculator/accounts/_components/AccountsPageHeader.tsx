import { type ReactNode, type Ref } from 'react';

import { PageHeader } from '~/components/PageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

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
            title={title}
            titleReference={titleReference}
        />
    );
}
