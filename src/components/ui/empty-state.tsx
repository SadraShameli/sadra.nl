import { type LucideIcon } from 'lucide-react';
import * as React from 'react';

import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '~/components/ui/empty';
import { cn } from '~/lib/utilities';

export function EmptyState({
    action,
    className,
    description,
    icon: Icon,
    title,
}: {
    action?: React.ReactNode;
    className?: string;
    description?: React.ReactNode;
    icon?: LucideIcon;
    title: React.ReactNode;
}) {
    return (
        <Empty className={cn('gap-2 border-none py-10', className)}>
            <EmptyHeader>
                {Icon && (
                    <EmptyMedia variant="icon">
                        <Icon />
                    </EmptyMedia>
                )}
                <EmptyTitle>{title}</EmptyTitle>
                {description && (
                    <EmptyDescription>{description}</EmptyDescription>
                )}
            </EmptyHeader>
            {action && <EmptyContent>{action}</EmptyContent>}
        </Empty>
    );
}
