import { SectionPageTabs } from '~/app/(app)/_components/SectionPageTabs';
import { PageHeader } from '~/components/PageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

import { LIFTING_NAV } from './liftingNav';

export function LiftingPageHeader({
    description,
    title,
}: {
    readonly description: string;
    readonly title: string;
}) {
    return (
        <PageHeader
            eyebrow={siteToolTitle(ToolTicker.Lifting)}
            lead={description}
            tabs={<SectionPageTabs items={LIFTING_NAV} label="Lifting pages" />}
            title={title}
        />
    );
}
