import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '~/lib/utils';

export function EmptyState({
    action,
    className,
    description,
    icon: Icon,
    title,
}: {
    action?: ReactNode;
    className?: string;
    description?: ReactNode;
    icon?: LucideIcon;
    title: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-2 py-10 text-center',
                className,
            )}
        >
            {Icon && (
                <div className="mb-1 rounded-full bg-muted/40 p-3 text-muted-foreground">
                    <Icon className="size-5" />
                </div>
            )}
            <p className="text-sm font-medium text-foreground">{title}</p>
            {description && (
                <p className="max-w-sm text-xs text-muted-foreground">
                    {description}
                </p>
            )}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
