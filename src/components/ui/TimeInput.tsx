import { Clock2 } from 'lucide-react';
import * as React from 'react';

import { Input } from '~/components/ui/Input';
import { cn } from '~/lib/utilities';

function TimeInput({
    className,
    ...properties
}: Omit<React.ComponentProps<'input'>, 'type'>) {
    return (
        <div className={cn('relative flex items-center', className)}>
            <Clock2
                aria-hidden
                className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground select-none"
            />
            <Input
                className="appearance-none pl-8 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                type="time"
                {...properties}
            />
        </div>
    );
}

export { TimeInput };
