import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../../../../src');

function sourceOf(relativePath: string): string {
    return readFileSync(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

describe('the firm payout count module is reached through its barrel (PT-36l, F-145)', () => {
    it('FirmProfitConcentration imports isPaidSinceLastLive through the advice barrel', () => {
        const source = sourceOf(
            'lib/prop-accounts/metrics/FirmProfitConcentration.ts',
        );
        expect(source).toContain("from '~/lib/prop-accounts/advice'");
        expect(source).not.toContain('advice/FirmPayoutCount');
    });

    it.each(['ExclusivityMovedAccount', 'ExclusivitySiblingRow'])(
        'the core barrel does not re-export the unused %s',
        (name) => {
            expect(sourceOf('lib/prop-accounts/core/index.ts')).not.toContain(
                name,
            );
        },
    );
});
