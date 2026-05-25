'use client';

import { X } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utils';

interface Props {
    active: boolean;
    className?: string;
    onReset: () => void;
}

export function ClearFiltersButton({ active, className, onReset }: Props) {
    if (!active) return null;
    return (
        <Button
            className={cn('ml-auto h-8 w-fit gap-1.5 text-xs', className)}
            onClick={onReset}
            type="button"
            variant="ghost"
        >
            <X className="size-3.5" /> Clear filters
        </Button>
    );
}
