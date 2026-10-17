'use client';

import { Check } from 'lucide-react';

import { FILTER_CONTROL_CLASS } from '~/components/ui/filter-control';
import { Toggle } from '~/components/ui/toggle';
import { cn } from '~/lib/utilities';

export type FilterToggleProperties = {
    isPressed: boolean;
    label: string;
    onPressedChange: (isPressed: boolean) => void;
};

export function FilterToggle({
    isPressed,
    label,
    onPressedChange,
}: FilterToggleProperties) {
    return (
        <Toggle
            className={cn(FILTER_CONTROL_CLASS, 'w-auto gap-1.5 px-4')}
            onPressedChange={onPressedChange}
            pressed={isPressed}
            variant="outline"
        >
            {isPressed && <Check aria-hidden />}
            {label}
        </Toggle>
    );
}
