import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import { cn } from '~/lib/utilities';

const BADGE_CLASS =
    'inline-flex items-center rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

export interface BadgeProperties extends React.HTMLAttributes<HTMLSpanElement> {
    asChild?: boolean;
}

function Badge({ asChild = false, className, ...properties }: BadgeProperties) {
    const Comp = asChild ? Slot : 'span';
    return <Comp className={cn(BADGE_CLASS, className)} {...properties} />;
}

export { Badge };
