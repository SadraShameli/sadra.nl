'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/Button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { cn } from '~/lib/utils';

interface InfoPopoverProperties {
    children: React.ReactNode;
    className?: string;
    title: string;
}

export default function InfoPopover({
    children,
    className,
    title,
}: InfoPopoverProperties) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    aria-label={`About ${title}`}
                    className={cn(
                        'size-4 rounded-full p-0 text-muted-foreground',
                        className,
                    )}
                    size="sm"
                    type="button"
                    variant="ghost"
                >
                    <Info className="size-3.5" />
                </Button>
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
