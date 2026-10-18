import { describe, expect, it } from 'vitest';

import { cn } from '~/lib/utilities';

describe('cn with the theme utilities', () => {
    it('lets selected-pill replace an earlier background and text colour', () => {
        expect(cn('bg-muted text-ink', 'selected-pill')).toBe('selected-pill');
    });

    it('lets a type utility replace earlier font size and weight', () => {
        expect(cn('text-sm font-medium leading-none', 'type-eyebrow')).toBe(
            'type-eyebrow',
        );
    });

    it('lets glass replace an earlier background, border colour and shadow', () => {
        expect(cn('bg-card border-line shadow-sm', 'glass')).toBe('glass');
    });

    it('keeps unrelated classes beside a theme utility', () => {
        expect(cn('rounded-full px-3', 'selected-pill')).toBe(
            'rounded-full px-3 selected-pill',
        );
    });
});
