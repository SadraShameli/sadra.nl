'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '~/components/ui/Button';
import { routes } from '~/lib/routes';

export default function AppError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[app] unhandled error', error);
    }, [error]);

    return (
        <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <h1 className="text-3xl font-semibold">Something went wrong</h1>
            <p className="max-w-md text-sm text-muted-foreground">
                The page hit an unexpected error. You can try again, or head
                back home.
            </p>
            {error.digest && (
                <code className="text-[10px] text-muted-foreground/70">
                    ref: {error.digest}
                </code>
            )}
            <div className="mt-2 flex gap-2">
                <Button onClick={() => reset()} variant="default">
                    Try again
                </Button>
                <Button asChild variant="outline">
                    <Link href={routes.home}>Go home</Link>
                </Button>
            </div>
        </main>
    );
}
