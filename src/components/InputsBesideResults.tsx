import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

export function InputsBesideResults({
    className,
    inputs,
    results,
}: {
    readonly className?: string;
    readonly inputs: ReactNode;
    readonly results: ReactNode;
}) {
    return (
        <div
            className={cn(
                'app-inputs-beside-results',
                'grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start',
                className,
            )}
        >
            <div className="flex min-w-0 flex-col gap-4">{inputs}</div>
            <div className="flex min-w-0 flex-col gap-4">{results}</div>
        </div>
    );
}
