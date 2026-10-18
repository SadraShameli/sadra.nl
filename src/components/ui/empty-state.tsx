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

export enum EmptyStateSize {
    Compact = 'compact',
    Default = 'default',
}

interface EmptyStateProperties {
    readonly action?: React.ReactNode;
    readonly className?: string;
    readonly description?: React.ReactNode;
    readonly icon?: LucideIcon;
    readonly size?: EmptyStateSize;
    readonly title: React.ReactNode;
}

const SIZE_CLASS: Readonly<Record<EmptyStateSize, string>> = {
    [EmptyStateSize.Compact]: 'py-4 md:p-4',
    [EmptyStateSize.Default]: 'py-10',
};

export function EmptyState({
    action,
    className,
    description,
    icon: Icon,
    size = EmptyStateSize.Default,
    title,
}: EmptyStateProperties) {
    return (
        <Empty className={cn('gap-2 border-none', SIZE_CLASS[size], className)}>
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

export function NoMatchesState({
    icon,
    noun,
}: {
    readonly icon: LucideIcon;
    readonly noun: string;
}) {
    return (
        <EmptyState
            description="Try a different search or clear the filters."
            icon={icon}
            size={EmptyStateSize.Compact}
            title={`No matching ${noun}`}
        />
    );
}
