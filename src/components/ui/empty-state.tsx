import { type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Card, CardContent } from '~/components/ui/card';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '~/components/ui/empty';
import { cn } from '~/lib/utilities';

interface EmptyStateProperties {
    readonly action?: React.ReactNode;
    readonly className?: string;
    readonly description?: React.ReactNode;
    readonly icon?: LucideIcon;
    readonly title: React.ReactNode;
}

export function EmptyState({
    action,
    className,
    description,
    icon: Icon,
    title,
}: EmptyStateProperties) {
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

export function EmptyStatePanel(properties: EmptyStateProperties) {
    return (
        <Card>
            <CardContent>
                <EmptyState {...properties} />
            </CardContent>
        </Card>
    );
}
