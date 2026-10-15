import { describe, expect, it } from 'vitest';

import { renderThemeCss } from '~/lib/theme';

describe('renderThemeCss', () => {
    const css = renderThemeCss({
        dark: {
            background: 'black',
            primary: 'white',
            'shadow-opacity': '0.5',
        },
        light: {
            background: 'white',
            'letter-spacing': '-0.02em',
            primary: 'black',
            'shadow-blur': 'calc(1px)',
        },
    });

    it('scopes the light palette to the root and the dark one to the dark class', () => {
        const [light, dark] = css.split('\n', 2);
        expect(light?.startsWith('html:root{--background:white;')).toBe(true);
        expect(dark?.startsWith('html.dark{--background:black;')).toBe(true);
    });

    it('maps letter spacing to the tracking token', () => {
        expect(css).toContain('--tracking-normal:-0.02em;');
        expect(css).not.toContain('--letter-spacing');
    });

    it('derives the shadow scale and ignores a non-length shadow input', () => {
        expect(css).toContain(
            '--shadow-2xs:0 1px 3px 0px color-mix(in srgb, black 5.0%, transparent);',
        );
        expect(css).toContain('color-mix(in srgb, black 50.0%, transparent)');
        expect(css).not.toContain('calc(1px)');
    });
});
