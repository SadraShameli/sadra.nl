'use client';

import { Check } from 'lucide-react';

import { FILTER_CONTROL_CLASS } from '~/components/ui/filterControl';
import { Toggle } from '~/components/ui/Toggle';
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
            className={cn(
                FILTER_CONTROL_CLASS,
                'w-full gap-1.5 px-4 md:w-auto',
            )}
            onPressedChange={onPressedChange}
            pressed={isPressed}
            variant="outline"
        >
            {isPressed && <Check aria-hidden />}
            {label}
        </Toggle>
    );
}
