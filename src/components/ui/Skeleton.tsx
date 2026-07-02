import { cn } from '~/lib/utils';

function Skeleton({
    className,
    ...properties
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-muted opacity-100 transition-opacity duration-300 starting:opacity-0',
                className,
            )}
            {...properties}
        />
    );
}

export { Skeleton };
