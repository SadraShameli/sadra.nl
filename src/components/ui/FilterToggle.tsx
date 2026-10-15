'use client';

import { Check } from 'lucide-react';

import { Toggle } from '~/components/ui/Toggle';

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
            className="h-8 w-full gap-1.5 px-3 text-xs md:w-auto"
            onPressedChange={onPressedChange}
            pressed={isPressed}
            variant="outline"
        >
            {isPressed && <Check aria-hidden />}
            {label}
        </Toggle>
    );
}
