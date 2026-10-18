import * as React from 'react';

import { cn } from '~/lib/utilities';

type InputType =
    'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url';

function Input({
    className,
    type,
    ...properties
}: Omit<React.ComponentProps<'input'>, 'type'> & { type?: InputType }) {
    return (
        <input
            className={cn(
                'flex h-9 w-full min-w-0 rounded-md border border-line-hover bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none',
                'placeholder:text-muted-foreground',
                '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                'selection:bg-primary selection:text-primary-foreground',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
                'dark:border-line-hover dark:bg-input/30',
                className,
            )}
            data-slot="input"
            type={type}
            {...properties}
        />
    );
}

export { Input };
