import { type ReactNode } from 'react';

import { ToolPanel } from '~/components/ToolPanel';

interface BankrollSectionProperties {
    children: ReactNode;
    description: ReactNode;
    headingId: string;
    info?: ReactNode;
    title: string;
}

export function BankrollSection({
    children,
    description,
    headingId,
    info,
    title,
}: BankrollSectionProperties) {
    return (
        <section aria-labelledby={headingId}>
            <ToolPanel
                description={description}
                info={info}
                title={title}
                titleId={headingId}
            >
                {children}
            </ToolPanel>
        </section>
    );
}
