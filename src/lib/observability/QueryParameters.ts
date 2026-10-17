import type { ErrorEvent } from '@sentry/nextjs';

const BOUND_PARAMETERS = /\nparams: [\s\S]*?(?=\n {4}at |$)/u;

export function scrubQueryParameters(event: ErrorEvent): ErrorEvent {
    const exceptions = event.exception?.values ?? [];
    for (const exception of exceptions) {
        if (exception.value !== undefined) {
            exception.value = withoutQueryParameters(exception.value);
        }
    }
    const breadcrumbs = event.breadcrumbs ?? [];
    for (const breadcrumb of breadcrumbs) {
        if (breadcrumb.message !== undefined) {
            breadcrumb.message = withoutQueryParameters(breadcrumb.message);
        }
    }
    if (event.message !== undefined) {
        event.message = withoutQueryParameters(event.message);
    }
    return event;
}

export function withoutQueryParameters(text: string): string {
    return text.replace(BOUND_PARAMETERS, '');
}
