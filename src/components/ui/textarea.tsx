import * as React from 'react';

import { FIELD_SURFACE_CLASS } from '~/components/ui/field-surface';
import { cn } from '~/lib/utilities';

const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.ComponentProps<'textarea'>
>(({ className, ...properties }, reference) => {
    return (
        <textarea
            className={cn(
                FIELD_SURFACE_CLASS,
                'flex field-sizing-content max-h-80 min-h-20 w-full resize-none px-3 py-2 text-base placeholder:text-muted-foreground md:text-sm',
                className,
            )}
            ref={reference}
            {...properties}
        />
    );
});
Textarea.displayName = 'Textarea';

export { Textarea };
