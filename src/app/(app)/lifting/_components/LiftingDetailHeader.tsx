import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';

export function LiftingDetailHeader({
    description,
    eyebrow,
    title,
}: {
    readonly description: null | string;
    readonly eyebrow: string;
    readonly title: string;
}) {
    return (
        <ToolPageHeader
            className="mb-0"
            eyebrow={eyebrow}
            lead={description ?? undefined}
            title={title}
        />
    );
}
