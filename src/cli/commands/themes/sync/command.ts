import { defineCommand } from 'citty';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ui } from '~/cli/ui';
import { type ThemeBundle, themeBundleSchema } from '~/lib/theme';
import { TweakcnClient } from '~/lib/theme/server';

const BUNDLE_PATH = path.join(process.cwd(), 'src/lib/theme/bundled.json');

const command = defineCommand({
    meta: {
        description:
            'Download the tweakcn presets and community themes into the bundled catalog',
        name: 'sync',
    },
    async run() {
        const client = new TweakcnClient();
        const presets = await client.fetchPresets();
        const community = await client.fetchCommunity();
        const bundle: ThemeBundle = themeBundleSchema.parse({
            community,
            fetchedAt: new Date().toISOString(),
            presets,
        });
        await writeFile(BUNDLE_PATH, `${JSON.stringify(bundle)}\n`);
        ui.success(
            `Saved ${String(presets.length)} presets and ${String(community.length)} community themes.`,
        );
    },
});

export default command;
