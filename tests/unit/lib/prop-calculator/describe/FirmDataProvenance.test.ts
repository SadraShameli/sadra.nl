import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('firmDataProvenance: per-firm verification date and open items (PT-45, F-126)', () => {
    it('is exhaustive over every FirmId', () => {
        for (const firmId of Object.values(FirmId)) {
            const entry = firmDataProvenance(firmId);
            expect(entry).toBeDefined();
        }
    });

    it('gives every firm a verified-on date and a source citation, even when work is still open', () => {
        for (const firmId of Object.values(FirmId)) {
            const entry = firmDataProvenance(firmId);
            expect(entry.verifiedOn).toMatch(ISO_DATE);
            expect(entry.source.length).toBeGreaterThan(0);
            expect(Array.isArray(entry.openItems)).toBe(true);
        }
    });

    it('cites a path into the firm docs tree as its source, never a bare claim', () => {
        for (const firmId of Object.values(FirmId)) {
            const entry = firmDataProvenance(firmId);
            expect(entry.source).toMatch(/^\.claude\/prop-firms\//);
        }
    });

    it('lists E8Futures and TopStep as having open items rather than claiming full verification', () => {
        expect(firmDataProvenance(FirmId.E8Futures).openItems.length).toBe(1);
        expect(firmDataProvenance(FirmId.TopStep).openItems.length).toBe(1);
    });

    it('leaves a fully verified firm with no open items', () => {
        expect(firmDataProvenance(FirmId.AlphaFutures).openItems).toEqual([]);
    });

    it('returns the same entry object on repeated calls (no re-derivation per call)', () => {
        expect(firmDataProvenance(FirmId.Mffu)).toBe(
            firmDataProvenance(FirmId.Mffu),
        );
    });
});
