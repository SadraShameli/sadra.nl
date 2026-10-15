import { type ReactNode } from 'react';

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
                <h2
                    className="text-lg font-semibold tracking-tight text-white"
                    id={headingId}
                >
                    {title}
                </h2>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
        </section>
    );
}
