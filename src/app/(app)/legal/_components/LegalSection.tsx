import { type ReactNode } from 'react';

import { ToolSectionHeading } from '~/components/ToolSectionHeading';

export function LegalSection({
    children,
    title,
}: {
    readonly children: ReactNode;
    readonly title: ReactNode;
}) {
    return (
        <section>
            <ToolSectionHeading className="mt-8 mb-3">
                {title}
            </ToolSectionHeading>
            {children}
        </section>
    );
}
