import { type ReactNode } from 'react';

import { ToolPanel } from '~/components/ToolPanel';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

export function CardSkeleton({
    className,
    rowClassName,
    rows = 3,
}: {
    readonly className?: string;
    readonly rowClassName?: string;
    readonly rows?: number;
}) {
    return (
        <Card className={className}>
            <CardContent className="flex flex-col gap-3">
                <Skeleton className="mb-3 h-6 w-40" />
                {Array.from({ length: rows }, (_, index) => (
                    <Skeleton
                        className={cn('h-9 w-full', rowClassName)}
                        key={index}
                    />
                ))}
            </CardContent>
        </Card>
    );
}

export function PageHeaderSkeleton({
    className,
    hasDescription = true,
}: {
    readonly className?: string;
    readonly hasDescription?: boolean;
}) {
    return (
        <header className={cn('mb-8', className)}>
            <Skeleton className="h-9 w-48 sm:h-10 sm:w-64" />
            {hasDescription && (
                <Skeleton className="mt-2 h-5 w-full max-w-md sm:h-6" />
            )}
        </header>
    );
}

export function TitledCardSkeleton({
    bodyClassName,
    className,
    title,
}: {
    readonly bodyClassName?: string;
    readonly className?: string;
    readonly title: ReactNode;
}) {
    return (
        <ToolPanel className={className} title={title}>
            <Skeleton className={cn('h-40 w-full rounded-md', bodyClassName)} />
        </ToolPanel>
    );
}
