import { z } from 'zod';

import { ThemeSource } from '~/lib/theme';

export enum ThemeBrowseFilter {
    All = 'all',
    Community = 'community',
    Preset = 'preset',
}

export const THEME_BROWSE_FILTERS: readonly {
    readonly filter: ThemeBrowseFilter;
    readonly label: string;
}[] = [
    { filter: ThemeBrowseFilter.All, label: 'All' },
    { filter: ThemeBrowseFilter.Community, label: 'Community' },
    { filter: ThemeBrowseFilter.Preset, label: 'Presets' },
];

const themeBrowseFilterSchema = z
    .enum(ThemeBrowseFilter)
    .catch(ThemeBrowseFilter.All);

export function parseThemeBrowseFilter(value: string): ThemeBrowseFilter {
    return themeBrowseFilterSchema.parse(value);
}

export function themeBrowseSource(
    filter: ThemeBrowseFilter,
): null | ThemeSource.Community | ThemeSource.Preset {
    switch (filter) {
        case ThemeBrowseFilter.All: {
            return null;
        }
        case ThemeBrowseFilter.Community: {
            return ThemeSource.Community;
        }
        case ThemeBrowseFilter.Preset: {
            return ThemeSource.Preset;
        }
    }
}
