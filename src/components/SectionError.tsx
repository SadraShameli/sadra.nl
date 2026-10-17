'use client';

import * as Sentry from '@sentry/nextjs';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utilities';

export enum SectionErrorScope {
    Page = 'page',
    Panel = 'panel',
}

const SCOPE_TEXT: Readonly<Record<SectionErrorScope, string>> = {
    [SectionErrorScope.Page]: 'this page',
    [SectionErrorScope.Panel]: 'this section',
};

export interface SectionErrorProperties {
    readonly error: Error & { digest?: string };
    readonly retry: () => void;
}

export function SectionError({
    error,
    retry,
    scope = SectionErrorScope.Page,
    section,
}: SectionErrorProperties & {
    readonly scope?: SectionErrorScope;
    readonly section: string;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    const alert = (
        <Alert className="max-w-2xl" variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>{section} could not load</AlertTitle>
            <AlertDescription>
                <p>
                    Something went wrong while loading {SCOPE_TEXT[scope]}. Your
                    data is safe. Try again, and if it keeps happening, reload
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
    );
    return scope === SectionErrorScope.Page ? (
        <main className={cn('app-section-error', 'container pt-spacing pb-24')}>
            {alert}
        </main>
    ) : (
        alert
    );
}
