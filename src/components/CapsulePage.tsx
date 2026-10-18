import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

export function CapsulePage({
    children,
    className,
}: {
    readonly children: ReactNode;
    readonly className?: string;
}) {
    return (
        <main className="px-4 py-16">
            <div className={cn('mx-auto w-full max-w-capsule', className)}>
                {children}
            </div>
        </main>
    );
}
