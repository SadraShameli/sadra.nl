'use client';

import * as Sentry from '@sentry/nextjs';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

export interface SectionErrorProperties {
    readonly error: Error & { digest?: string };
    readonly retry: () => void;
}

export function SectionError({
    error,
    retry,
    section,
}: SectionErrorProperties & { readonly section: string }) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <main className={cn('app-section-error', 'container pt-spacing pb-24')}>
            <Alert className="max-w-2xl" variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertTitle>{section} could not load</AlertTitle>
                <AlertDescription>
                    <p>
                        Something went wrong while loading this page. Your data
                        is safe. Try again, and if it keeps happening, reload
                        the page or come back in a few minutes.
                    </p>
                    <Button
                        className="mt-4 gap-2"
                        onClick={retry}
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        <RotateCcw className="size-4" />
                        Try again
                    </Button>
                </AlertDescription>
            </Alert>
        </main>
    );
}
