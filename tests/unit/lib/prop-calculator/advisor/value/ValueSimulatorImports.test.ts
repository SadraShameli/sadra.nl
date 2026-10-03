import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { importSpecifiersOf } from '../../../../importSpecifiers';

const VALUE_ROOT = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
    'value',
);
const SIMULATOR_BARREL = '~/lib/prop-calculator/simulator';
const LIVE_SETUP_COPY_MARKERS = [
    'resolveLiveTransferSetup',
    'runLiveTransferContinuation',
    'liveTransferOptionsFor',
];

const FILES = readdirSync(VALUE_ROOT).filter((name) => name.endsWith('.ts'));

describe('the value layer reaches the simulator through its barrel only (PT-73g step 2)', () => {
    it('finds the value layer files', () => {
        expect(FILES).toContain('ValueChain.ts');
        expect(FILES).toContain('PayoutStakeComparison.ts');
    });

    it.each(FILES)('%s does not deep-import the simulator', (name) => {
        const source = readFileSync(path.join(VALUE_ROOT, name), 'utf8');
        const deep = importSpecifiersOf(source)
            .map((specifier) => specifier.specifier)
            .filter((specifier) =>
                specifier.startsWith(`${SIMULATOR_BARREL}/`),
            );

        expect(deep).toEqual([]);
    });

    it.each(FILES)(
        '%s keeps no copy of the live-transfer setup mapping',
        (name) => {
            const source = readFileSync(path.join(VALUE_ROOT, name), 'utf8');

            for (const marker of LIVE_SETUP_COPY_MARKERS) {
                expect(source).not.toContain(marker);
            }
        },
    );
});
