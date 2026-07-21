import * as React from 'react';

import { cn } from '~/lib/utilities';

const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.ComponentProps<'textarea'>
>(({ className, ...properties }, reference) => {
    return (
        <textarea
            className={cn(
                'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className,
            )}
            ref={reference}
            {...properties}
        />
    );
});
Textarea.displayName = 'Textarea';

export { Textarea };
