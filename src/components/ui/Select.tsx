import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utils';

interface SelectProps extends React.ComponentProps<'select'> {
    wrapperClassName?: string;
}

function Select({
    children,
    className,
    wrapperClassName,
    ...props
}: SelectProps) {
    return (
        <div className={cn('relative w-full', wrapperClassName)}>
            <select
                className={cn(
                    'h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm shadow-xs transition-colors outline-none',
                    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                    'dark:border-input dark:bg-input/30',
                    className,
                )}
                data-slot="select"
                {...props}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
    );
}

export { Select };
