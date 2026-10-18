import { Loader2Icon } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utilities';

function Spinner({ className, ...properties }: React.ComponentProps<'svg'>) {
    const isHidden =
        properties['aria-hidden'] === true ||
        properties['aria-hidden'] === 'true';
    return (
        <Loader2Icon
            aria-label={isHidden ? undefined : 'Loading'}
            className={cn('size-4 animate-spin', className)}
            role={isHidden ? undefined : 'status'}
            {...properties}
        />
    );
}

export { Spinner };
