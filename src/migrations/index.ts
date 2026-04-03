import * as migration_20260403_221327_initial from './20260403_221327_initial';
import * as migration_20260403_221808_add_site_homepage_globals from './20260403_221808_add_site_homepage_globals';
import * as migration_20260403_222314_homepage_site_required_fields from './20260403_222314_homepage_site_required_fields';
import * as migration_20260403_223529 from './20260403_223529';
import * as migration_20260403_223858 from './20260403_223858';

export const migrations = [
    {
        up: migration_20260403_221327_initial.up,
        down: migration_20260403_221327_initial.down,
        name: '20260403_221327_initial',
    },
    {
        up: migration_20260403_221808_add_site_homepage_globals.up,
        down: migration_20260403_221808_add_site_homepage_globals.down,
        name: '20260403_221808_add_site_homepage_globals',
    },
    {
        up: migration_20260403_222314_homepage_site_required_fields.up,
        down: migration_20260403_222314_homepage_site_required_fields.down,
        name: '20260403_222314_homepage_site_required_fields',
    },
    {
        up: migration_20260403_223529.up,
        down: migration_20260403_223529.down,
        name: '20260403_223529',
    },
    {
        up: migration_20260403_223858.up,
        down: migration_20260403_223858.down,
        name: '20260403_223858',
    },
];
