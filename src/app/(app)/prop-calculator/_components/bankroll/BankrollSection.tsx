import { type ReactNode } from 'react';

import { ToolSectionHeading } from '~/components/ToolSectionHeading';

interface BankrollSectionProperties {
    children: ReactNode;
    description: ReactNode;
    headingId: string;
    title: string;
}

export function BankrollSection({
    children,
    description,
    headingId,
    title,
}: BankrollSectionProperties) {
    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <ToolSectionHeading id={headingId}>{title}</ToolSectionHeading>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
        </section>
    );
}
