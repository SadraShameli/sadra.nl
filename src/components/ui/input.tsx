import * as React from 'react';

import { FIELD_SURFACE_CLASS } from '~/components/ui/field-surface';
import { cn } from '~/lib/utilities';

type InputType =
    'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url';

export const NUMBER_INPUT_CLASS = 'max-w-28 tabular-nums';

export const NUMBER_FIELD_ROW_CLASS =
    'flex flex-wrap items-start gap-x-10 gap-y-4';

function Input({
    className,
    type,
    ...properties
}: Omit<React.ComponentProps<'input'>, 'type'> & { type?: InputType }) {
    return (
        <input
            className={cn(
                FIELD_SURFACE_CLASS,
                'flex h-9 w-full min-w-0 px-3 py-1 text-sm',
                'placeholder:text-muted-foreground',
                '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                'selection:bg-primary selection:text-primary-foreground',
                'disabled:pointer-events-none',
                className,
            )}
            data-slot="input"
            type={type}
            {...properties}
        />
    );
}

export { Input };
