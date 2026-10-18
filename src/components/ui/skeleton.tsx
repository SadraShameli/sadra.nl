import { cn } from '~/lib/utilities';

function Skeleton({
    className,
    ...properties
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-ink/10 opacity-100 transition-opacity delay-150 duration-500 ease-out starting:opacity-0',
                className,
            )}
            data-slot="skeleton"
            {...properties}
        />
    );
}

export { Skeleton };
