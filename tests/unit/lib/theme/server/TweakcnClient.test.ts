import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvalidThemeLinkError, TweakcnClient } from '~/lib/theme/server';

describe('TweakcnClient.parseThemeReference', () => {
    it.each([
        [
            'https://tweakcn.com/themes/cmlh0x713000104jrgmds6vcd',
            'cmlh0x713000104jrgmds6vcd',
        ],
        ['https://tweakcn.com/r/themes/modern-minimal.json', 'modern-minimal'],
        ['https://tweakcn.com/editor/theme?theme=claude', 'claude'],
        ['  doom-64  ', 'doom-64'],
    ])('reads the theme id from %s', (input, id) => {
        expect(TweakcnClient.parseThemeReference(input)).toBe(id);
    });

    it.each([
        'https://evil.example/themes/abc',
        'https://tweakcn.com.evil.example/themes/abc',
        'https://tweakcn.com/',
        'not a link',
    ])('rejects %s', (input) => {
        expect(() => TweakcnClient.parseThemeReference(input)).toThrow(
            InvalidThemeLinkError,
        );
    });
});

describe('TweakcnClient.fetchTheme', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('replaces a prose dash in the theme title with a comma', async () => {
        const item = {
            cssVars: {
                dark: { background: 'black', primary: 'white' },
                light: { background: 'white', primary: 'black' },
            },
            name: 'night-owl',
            title: `Night ${String.fromCodePoint(0x20_14)} Owl`,
        };
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(Response.json(item))),
        );
        const theme = await new TweakcnClient().fetchTheme('night-owl');
        expect(theme.name).toBe('Night, Owl');
    });
});
