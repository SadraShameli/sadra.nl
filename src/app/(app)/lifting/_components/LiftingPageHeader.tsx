import { PageHeader } from '~/components/PageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

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
            title={title}
        />
    );
}
