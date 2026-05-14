'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { cn } from '~/lib/utils';

interface InfoPopoverProps {
    children: React.ReactNode;
    className?: string;
    title: string;
}

export default function InfoPopover({
    children,
    className,
    title,
}: InfoPopoverProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    aria-label={`About ${title}`}
                    className={cn(
                        'inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
                        className,
                    )}
                    type="button"
                >
                    <Info className="size-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-sm leading-relaxed text-muted-foreground [&_p:not([class*='text-'])]:text-sm">
                        {children}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
