import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

export function LiftingPageHeader({
    description,
    title,
}: {
    readonly description: string;
    readonly title: string;
}) {
    return (
        <ToolPageHeader
            eyebrow={siteToolTitle(ToolTicker.Lifting)}
            lead={description}
            title={title}
        />
    );
}
