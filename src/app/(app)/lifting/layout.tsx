import { type ReactNode } from 'react';

import { TooltipProvider } from '~/components/ui/Tooltip';
import { cn } from '~/lib/utilities';

import { LiftingSubnav } from './_components/LiftingSubnav';

export default function LiftingLayout({ children }: { children: ReactNode }) {
    return (
        <TooltipProvider delayDuration={250}>
            <div className={cn('app-lifting')}>
                <LiftingSubnav />
                {children}
            </div>
        </TooltipProvider>
    );
}
