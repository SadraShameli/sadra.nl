'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/utilities';

export enum InfoPopoverWidth {
    Default = 'default',
    Wide = 'wide',
}

const WIDTH_CLASS: Record<InfoPopoverWidth, string> = {
    [InfoPopoverWidth.Default]: 'w-80',
    [InfoPopoverWidth.Wide]: 'w-xl',
};

interface InfoPopoverProperties {
    children: React.ReactNode;
    className?: string;
    title: string;
    width?: InfoPopoverWidth;
}

export default function InfoPopover({
    children,
    className,
    title,
    width = InfoPopoverWidth.Default,
}: InfoPopoverProperties) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    aria-label={`About ${title}`}
                    className={cn(
                        'relative size-4 rounded-full p-0 text-muted-foreground',
                        'before:absolute before:top-1/2 before:left-1/2 before:size-6 before:-translate-1/2 pointer-coarse:before:size-11',
                        className,
                    )}
                    size="sm"
                    type="button"
                    variant="ghost"
                >
                    <Info className="size-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className={cn(
                    WIDTH_CLASS[width],
                    'max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-2rem)] overflow-y-auto',
                )}
            >
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-sm/relaxed text-muted-foreground [&_p:not([class*='text-'])]:text-sm">
                        {children}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
