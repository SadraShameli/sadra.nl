import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

import {
    type AppliedTheme,
    applyBrowserTheme,
    browserThemeBootScript,
    storedBrowserTheme,
    ThemeSource,
} from '~/lib/theme';

const THEME: AppliedTheme = {
    css: 'html:root{--background:white;}',
    fonts: ['Plus Jakarta Sans'],
    id: 'deep-purple',
    name: 'Deep Purple',
    source: ThemeSource.Community,
};

function fontLinks(): HTMLLinkElement[] {
    return [
        ...document.head.querySelectorAll<HTMLLinkElement>(
            'link[data-theme-font]',
        ),
    ];
}

function themeStyle(): HTMLStyleElement | null {
    return document.head.querySelector('style#sadra-theme');
}

describe('BrowserTheme', () => {
    afterEach(() => {
        localStorage.clear();
        document.head.replaceChildren();
    });

    it('stores the theme and injects its style and fonts once', () => {
        applyBrowserTheme(THEME);
        applyBrowserTheme(THEME);
        expect(storedBrowserTheme()).toEqual(THEME);
        expect(themeStyle()?.textContent).toBe(THEME.css);
        expect(
            document.head.querySelectorAll('style#sadra-theme'),
        ).toHaveLength(1);
        expect(fontLinks().map((link) => link.getAttribute('href'))).toEqual([
            '/api/theme/font?family=Plus+Jakarta+Sans',
        ]);
    });

    it('clears the stored theme and its style', () => {
        applyBrowserTheme(THEME);
        applyBrowserTheme(null);
        expect(storedBrowserTheme()).toBeNull();
        expect(themeStyle()).toBeNull();
    });

    it('restores the stored theme from the boot script before React runs', () => {
        localStorage.setItem(
            'sadra-theme',
            JSON.stringify({ ...THEME, fonts: [] }),
        );
        runInNewContext(browserThemeBootScript(), {
            console,
            document,
            encodeURIComponent,
            localStorage,
        });
        expect(themeStyle()?.textContent).toBe(THEME.css);
    });
});
