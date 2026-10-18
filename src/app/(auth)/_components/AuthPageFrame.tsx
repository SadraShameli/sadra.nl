import { type ReactNode } from 'react';

import { PageHeader } from '~/components/PageHeader';
import { PageTransition } from '~/components/PageTransition';
import { Card } from '~/components/ui/card';
import { cn } from '~/lib/utilities';

export function AuthPageFrame({
    children,
    title,
}: {
    readonly children: ReactNode;
    readonly title: string;
}) {
    return (
        <PageTransition>
            <div
                className={cn(
                    'app-auth__page',
                    'flex flex-1 items-center justify-center px-4 pt-20 pb-12',
                )}
            >
                <div className="w-full max-w-sm">
                    <PageHeader title={title} />
                    <Card>{children}</Card>
                </div>
            </div>
        </PageTransition>
    );
}
