'use client';

import * as Sentry from '@sentry/nextjs';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { CapsulePage } from '~/components/CapsulePage';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '~/components/ui/empty';

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

    const message = (
        <>
            Something went wrong while loading {SCOPE_TEXT[scope]}. Your data is
            safe. Try again, and if it keeps happening, reload the page or come
            back in a few minutes.
        </>
    );
    const retryButton = (
        <Button onClick={retry} type="button" variant="outline">
            <RotateCcw />
            Try again
        </Button>
    );
    if (scope === SectionErrorScope.Panel) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{section} could not load</AlertTitle>
                <AlertDescription>
                    <p>{message}</p>
                    <div className="mt-4">{retryButton}</div>
                </AlertDescription>
            </Alert>
        );
    }
    return (
        <CapsulePage className="app-section-error">
            <Empty className="min-h-[50svh] rounded-3xl border border-line bg-surface">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <TriangleAlert />
                    </EmptyMedia>
                    <EmptyTitle>{section} could not load</EmptyTitle>
                    <EmptyDescription>{message}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>{retryButton}</EmptyContent>
            </Empty>
        </CapsulePage>
    );
}
