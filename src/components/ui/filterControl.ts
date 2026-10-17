import { cn } from '~/lib/utilities';

export const FILTER_CONTROL_CLASS =
    'h-9 rounded-full border-line-hover bg-surface text-xs dark:border-line-hover dark:bg-surface';

export const SEARCH_FIELD_CLASS = cn(
    FILTER_CONTROL_CLASS,
    'w-auto min-w-44 max-w-xs px-4 field-sizing-content',
);
