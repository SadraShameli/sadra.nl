import { ChevronDown } from 'lucide-react';
import { type ReactNode } from 'react';

import { Button } from '~/components/ui/Button';
import { CollapsibleTrigger } from '~/components/ui/Collapsible';
import { cn } from '~/lib/utilities';

export function DisclosureTrigger({
    children,
    className,
}: {
    readonly children: ReactNode;
    readonly className?: string;
}) {
    return (
        <CollapsibleTrigger asChild>
            <Button
                className={cn(
                    'group/disclosure -ml-2.5 h-auto min-h-8 self-start text-left whitespace-normal text-muted-foreground',
                    className,
                )}
                size="sm"
                variant="ghost"
            >
                {children}
                <ChevronDown className="transition-transform group-data-[state=open]/disclosure:rotate-180" />
            </Button>
        </CollapsibleTrigger>
    );
}
