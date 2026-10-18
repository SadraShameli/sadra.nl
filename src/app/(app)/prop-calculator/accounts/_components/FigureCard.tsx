import { type ReactNode } from 'react';

import { Card } from '~/components/ui/card';
import { cn } from '~/lib/utilities';

export function FigureCard({
    label,
    value,
    valueClassName,
}: {
    readonly label: ReactNode;
    readonly value: ReactNode;
    readonly valueClassName?: string;
}) {
    return (
        <Card className="gap-1 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'text-lg font-semibold tabular-nums',
                    valueClassName,
                )}
            >
                {value}
            </dd>
        </Card>
    );
}
