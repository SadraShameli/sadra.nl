'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utils';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';

interface InfoPopoverProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

export default function InfoPopover({
    title,
    children,
    className,
}: InfoPopoverProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`About ${title}`}
                    className={cn(
                        'inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
                        className,
                    )}
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
