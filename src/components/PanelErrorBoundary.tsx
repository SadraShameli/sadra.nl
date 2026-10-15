'use client';

import { catchError, type ErrorInfo } from 'next/error';

import { SectionError, SectionErrorScope } from '~/components/SectionError';

interface PanelErrorBoundaryProperties {
    readonly section: string;
}

const UNKNOWN_PANEL_ERROR = 'The panel failed with a non-error value.';

function errorOf(thrown: unknown): Error {
    return thrown instanceof Error
        ? thrown
        : new Error(UNKNOWN_PANEL_ERROR, { cause: thrown });
}

function PanelErrorFallback(
    { section }: PanelErrorBoundaryProperties,
    { error, retry }: ErrorInfo,
) {
    return (
        <SectionError
            error={errorOf(error)}
            retry={retry}
            scope={SectionErrorScope.Panel}
            section={section}
        />
    );
}

export const PanelErrorBoundary = catchError(PanelErrorFallback);
