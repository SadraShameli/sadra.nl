import { type ComponentProps, type ReactNode, type Ref } from 'react';

import { cn } from '~/lib/utilities';

export function ToolPageHeader({
    actions,
    className,
    eyebrow,
    lead,
    title,
    titleReference,
}: {
    readonly actions?: ReactNode;
    readonly className?: string;
    readonly eyebrow: string;
    readonly lead?: ReactNode;
    readonly title: ReactNode;
    readonly titleReference?: Ref<HTMLHeadingElement>;
}) {
    return (
        <header
            className={cn(
                'app-tool__header',
                'mb-10 flex flex-wrap items-end justify-between gap-6',
                className,
            )}
        >
            <div className="flex max-w-2xl flex-col gap-4">
                <div className="type-eyebrow text-camel">{eyebrow}</div>
                <ToolPageTitle
                    ref={titleReference}
                    tabIndex={titleReference === undefined ? undefined : -1}
                >
                    {title}
                </ToolPageTitle>
                {lead === undefined ? null : (
                    <ToolPageLead>{lead}</ToolPageLead>
                )}
            </div>
            {actions === undefined ? null : (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </header>
    );
}

export function ToolPageTitle({
    children,
    className,
    ...properties
}: ComponentProps<'h1'>) {
    return (
        <h1
            className={cn(
                'm-0 type-display-page text-balance text-ink outline-none',
                className,
            )}
            {...properties}
        >
            {children}
        </h1>
    );
}

function ToolPageLead({ children }: { readonly children: ReactNode }) {
    return (
        <p className="m-0 max-w-measure text-[15px]/relaxed text-ink-muted">
            {children}
        </p>
    );
}
