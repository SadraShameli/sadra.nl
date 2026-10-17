import { type ReactNode } from 'react';

import { ToolSectionHeading } from '~/app/(app)/_components/ToolSectionHeading';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { cn } from '~/lib/utilities';

export function ToolPanel({
    actions,
    children,
    className,
    contentClassName,
    description,
    title,
}: {
    readonly actions?: ReactNode;
    readonly children: ReactNode;
    readonly className?: string;
    readonly contentClassName?: string;
    readonly description?: ReactNode;
    readonly title: ReactNode;
}) {
    return (
        <Card className={cn('app-tool__panel', 'min-w-0 gap-6', className)}>
            <CardHeader className="items-start gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <ToolSectionHeading>{title}</ToolSectionHeading>
                    {description === undefined ? null : (
                        <p className="m-0 text-sm text-ink-muted">
                            {description}
                        </p>
                    )}
                </div>
                {actions === undefined ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                        {actions}
                    </div>
                )}
            </CardHeader>
            <CardContent
                className={cn('flex flex-col gap-5', contentClassName)}
            >
                {children}
            </CardContent>
        </Card>
    );
}
