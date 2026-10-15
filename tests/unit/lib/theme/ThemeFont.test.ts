import { describe, expect, it } from 'vitest';

import { firstFontFamily, themeFontFamilies } from '~/lib/theme';

describe('firstFontFamily', () => {
    it('returns the first named family without quotes', () => {
        expect(firstFontFamily("'Plus Jakarta Sans', Inter, sans-serif")).toBe(
            'Plus Jakarta Sans',
        );
    });

    it('skips system font stacks and unsafe names', () => {
        expect(firstFontFamily('ui-sans-serif, system-ui')).toBeNull();
        expect(firstFontFamily('Georgia, serif')).toBeNull();
        expect(firstFontFamily('Evil<Font>, serif')).toBeNull();
        expect(firstFontFamily(undefined)).toBeNull();
    });
});

describe('themeFontFamilies', () => {
    it('lists each light palette font once', () => {
        expect(
            themeFontFamilies({
                dark: {},
                light: {
                    'font-mono': 'JetBrains Mono, monospace',
                    'font-sans': 'Inter, sans-serif',
                    'font-serif': 'Inter, serif',
                },
            }),
        ).toEqual(['Inter', 'JetBrains Mono']);
    });
});
