import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const LAST_VERIFIED_LINE =
    /^\*\*Last Verified:\*\*\s*`?(\d{4}-\d{2}-\d{2})`?\s*$/mu;

function readmeLastVerified(firmId: FirmId): null | string {
    const text = readFileSync(readmePathOf(firmId), 'utf8');
    return LAST_VERIFIED_LINE.exec(text)?.[1] ?? null;
}

function readmePathOf(firmId: FirmId): string {
    return path.join(REPO_ROOT, '.claude', 'prop-firms', firmId, 'README.md');
}

describe('firmDataProvenance dates match the firm trees (PT-117, F-98)', () => {
    it('reads a Last Verified date from every firm README, bare or in backticks', () => {
        for (const firmId of Object.values(FirmId)) {
            expect(readmeLastVerified(firmId), firmId).toMatch(
                /^\d{4}-\d{2}-\d{2}$/u,
            );
        }
    });

    it('cites the README of the firm directory named by its FirmId', () => {
        for (const firmId of Object.values(FirmId)) {
            expect(firmDataProvenance(firmId).source, firmId).toBe(
                `.claude/prop-firms/${firmId}/README.md`,
            );
        }
    });

    it.each(Object.values(FirmId))(
        'shows the %s README Last Verified date as its verifiedOn',
        (firmId) => {
            expect(firmDataProvenance(firmId).verifiedOn).toBe(
                readmeLastVerified(firmId),
            );
        },
    );

    it('recognises both README date styles', () => {
        expect(
            LAST_VERIFIED_LINE.exec('**Last Verified:** `2026-10-02`')?.[1],
        ).toBe('2026-10-02');
        expect(
            LAST_VERIFIED_LINE.exec('**Last Verified:** 2026-09-19')?.[1],
        ).toBe('2026-09-19');
        expect(
            LAST_VERIFIED_LINE.exec('**Last Verified:** see below'),
        ).toBeNull();
    });
});
