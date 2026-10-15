import 'server-only';

import { themeBundleSchema } from '~/lib/theme/themeSchemas';

import { ThemeCatalog } from './ThemeCatalog';

class BundledThemeCatalog {
    private catalog: null | Promise<ThemeCatalog> = null;

    load(): Promise<ThemeCatalog> {
        this.catalog ??= parsedBundledCatalog();
        return this.catalog;
    }
}

async function parsedBundledCatalog(): Promise<ThemeCatalog> {
    const bundled = await import('~/lib/theme/bundled.json');
    return new ThemeCatalog(themeBundleSchema.parse(bundled.default));
}

export const bundledThemeCatalog = new BundledThemeCatalog();
