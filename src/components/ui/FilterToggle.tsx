'use client';

import { Check } from 'lucide-react';

import { Toggle } from '~/components/ui/Toggle';

export type FilterToggleProperties = {
    label: string;
    onPressedChange: (pressed: boolean) => void;
    pressed: boolean;
};

export function FilterToggle({
    label,
    onPressedChange,
    pressed,
}: FilterToggleProperties) {
    return (
        <Toggle
            className="h-8 w-full gap-1.5 px-3 text-xs md:w-auto"
            onPressedChange={onPressedChange}
            pressed={pressed}
            variant="outline"
        >
            {pressed && <Check aria-hidden />}
            {label}
        </Toggle>
    );
}
