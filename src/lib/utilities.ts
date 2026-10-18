import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const TYPE_SCALE = [
    'body',
    'display-caption',
    'display-closing',
    'display-figure',
    'display-hero',
    'display-item',
    'display-page',
    'display-section',
    'display-stat',
    'display-title',
    'eyebrow',
    'lead',
    'micro',
    'small',
    'ticker',
];

const twMerge = extendTailwindMerge<'glass' | 'selected-pill' | 'type-scale'>({
    extend: {
        classGroups: {
            glass: ['glass'],
            'selected-pill': ['selected-pill'],
            'type-scale': [{ type: TYPE_SCALE }],
        },
        conflictingClassGroups: {
            'bg-color': ['selected-pill'],
            glass: ['bg-color', 'border-color', 'shadow'],
            'selected-pill': ['bg-color', 'text-color'],
            'type-scale': [
                'font-family',
                'font-size',
                'font-weight',
                'leading',
                'text-transform',
                'tracking',
            ],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function parseEnum<T extends string>(
    enumObject: Readonly<Record<string, T>>,
    value: null | string,
): null | T {
    return Object.values(enumObject).find((member) => member === value) ?? null;
}
