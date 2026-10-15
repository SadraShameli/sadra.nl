import 'server-only';

import { type ThemeBundle, type TweakcnTheme } from '~/lib/theme/themeSchemas';
import { type ThemeSource } from '~/lib/theme/ThemeSource';
import { SWATCH_THEME_VAR_KEYS } from '~/lib/theme/ThemeVarKey';

export interface ThemeCatalogPage {
    readonly items: readonly ThemeSummary[];
    readonly pageSize: number;
    readonly total: number;
}

export interface ThemeCatalogQuery {
    readonly page: number;
    readonly pageSize: number;
    readonly search: string;
    readonly source: null | ThemeSource;
}

export interface ThemeSummary {
    readonly author: null | string;
    readonly id: string;
    readonly likes: null | number;
    readonly name: string;
    readonly source: ThemeSource;
    readonly swatches: readonly string[];
}

export class ThemeCatalog {
    private readonly themes: readonly TweakcnTheme[];

    constructor(bundle: ThemeBundle) {
        this.themes = [...bundle.presets, ...bundle.community];
    }

    find(id: string, source: ThemeSource): null | TweakcnTheme {
        return (
            this.themes.find(
                (theme) => theme.id === id && theme.source === source,
            ) ?? null
        );
    }

    page(query: ThemeCatalogQuery): ThemeCatalogPage {
        const needle = query.search.trim().toLowerCase();
        const matches = this.themes.filter(
            (theme) =>
                (query.source === null || theme.source === query.source) &&
                (needle === '' ||
                    theme.name.toLowerCase().includes(needle) ||
                    (theme.author?.toLowerCase().includes(needle) ?? false)),
        );
        const start = (query.page - 1) * query.pageSize;
        return {
            items: matches
                .slice(start, start + query.pageSize)
                .map((theme) => summaryOf(theme)),
            pageSize: query.pageSize,
            total: matches.length,
        };
    }
}

function summaryOf(theme: TweakcnTheme): ThemeSummary {
    return {
        author: theme.author,
        id: theme.id,
        likes: theme.likes,
        name: theme.name,
        source: theme.source,
        swatches: SWATCH_THEME_VAR_KEYS.map(
            (key) => theme.styles.dark[key],
        ).filter((value) => value !== undefined),
    };
}
