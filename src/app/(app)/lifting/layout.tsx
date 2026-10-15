import { type Instant } from 'next';

import { TooltipProvider } from '~/components/ui/Tooltip';
import { cn } from '~/lib/utilities';

import { LiftingSubnav } from './_components/LiftingSubnav';

export const instant: Instant = true;

export default function LiftingLayout({ children }: LayoutProps<'/lifting'>) {
    return (
        <TooltipProvider delayDuration={250}>
            <div className={cn('app-lifting')}>
                <LiftingSubnav />
                {children}
            </div>
        </TooltipProvider>
    );
}
