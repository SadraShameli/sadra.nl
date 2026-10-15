import { describe, expect, it } from 'vitest';

import { ThemeSource, type TweakcnTheme } from '~/lib/theme';
import { ThemeCatalog } from '~/lib/theme/server';

function theme(
    id: string,
    source: ThemeSource,
    author: null | string,
): TweakcnTheme {
    return {
        author,
        id,
        likes: null,
        name: id.replaceAll('-', ' '),
        source,
        styles: {
            dark: { background: 'black', primary: 'white' },
            light: { background: 'white', primary: 'black' },
        },
    };
}

const catalog = new ThemeCatalog({
    community: [
        theme('ocean-breeze', ThemeSource.Community, 'Ana'),
        theme('deep-purple', ThemeSource.Community, 'Sam'),
    ],
    fetchedAt: '2026-10-15T00:00:00.000Z',
    presets: [theme('modern-minimal', ThemeSource.Preset, null)],
});

describe('ThemeCatalog', () => {
    it('pages presets first, then community themes', () => {
        const page = catalog.page({
            page: 1,
            pageSize: 2,
            search: '',
            source: null,
        });
        expect(page.total).toBe(3);
        expect(page.pageSize).toBe(2);
        expect(page.items.map((item) => item.id)).toEqual([
            'modern-minimal',
            'ocean-breeze',
        ]);
        expect(page.items[0]?.swatches).toEqual(['black', 'white']);
    });

    it('filters by source and searches names and authors', () => {
        expect(
            catalog
                .page({
                    page: 1,
                    pageSize: 10,
                    search: 'sam',
                    source: ThemeSource.Community,
                })
                .items.map((item) => item.id),
        ).toEqual(['deep-purple']);
        expect(
            catalog.page({
                page: 1,
                pageSize: 10,
                search: 'ocean',
                source: ThemeSource.Preset,
            }).total,
        ).toBe(0);
    });

    it('finds a theme only under its own source', () => {
        expect(catalog.find('deep-purple', ThemeSource.Community)?.id).toBe(
            'deep-purple',
        );
        expect(catalog.find('deep-purple', ThemeSource.Preset)).toBeNull();
    });
});
