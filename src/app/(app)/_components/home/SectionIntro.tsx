import { type EmphasisHeading } from '~/lib/site/content';

import { SectionHeading } from './EmphasisTitle';

export function SectionIntro({
    body,
    heading,
}: {
    readonly body: string;
    readonly heading: EmphasisHeading;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading heading={heading} />
            <p className="m-0 max-w-110 type-body text-ink-muted">{body}</p>
        </div>
    );
}
