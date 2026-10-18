import { PageHeader, type PageHeaderBackLink } from '~/components/PageHeader';
import { Badge } from '~/components/ui/badge';

export function LiftingDetailHeader({
    backLink,
    description,
    meta,
    title,
}: {
    readonly backLink: PageHeaderBackLink;
    readonly description: null | string;
    readonly meta: readonly string[];
    readonly title: string;
}) {
    return (
        <PageHeader
            backLink={backLink}
            className="mb-0"
            lead={description ?? undefined}
            meta={
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {meta.map((item) => (
                        <li key={item}>
                            <Badge>{item}</Badge>
                        </li>
                    ))}
                </ul>
            }
            title={title}
        />
    );
}
