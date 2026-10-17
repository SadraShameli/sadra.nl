import { Loader2Icon } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utilities';

function Spinner({ className, ...properties }: React.ComponentProps<'svg'>) {
    return (
        <Loader2Icon
            aria-label="Loading"
            className={cn('size-4 animate-spin', className)}
            role="status"
            {...properties}
        />
    );
}

export { Spinner };
