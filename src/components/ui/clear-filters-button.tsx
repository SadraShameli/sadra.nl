'use client';

import { X } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { FILTER_CONTROL_CLASS } from '~/components/ui/filter-control';
import { cn } from '~/lib/utilities';

interface Properties {
    active: boolean;
    className?: string;
    onReset: () => void;
}

export function ClearFiltersButton({ active, className, onReset }: Properties) {
    return active ? (
        <Button
            className={cn(
                FILTER_CONTROL_CLASS,
                'w-fit gap-1.5 px-4',
                className,
            )}
            onClick={onReset}
            type="button"
            variant="ghost"
        >
            <X className="size-3.5" /> Clear filters
        </Button>
    ) : null;
}
