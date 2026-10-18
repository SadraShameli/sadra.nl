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
        expect(
            firmDataProvenance(FirmId.E8Futures).openItems.length,
        ).toBeGreaterThan(0);
        expect(
            firmDataProvenance(FirmId.TopStep).openItems.length,
        ).toBeGreaterThan(0);
    });

    it('no longer carries the FTMO bulk adversarial-verifier item, which REMAINING.md records as done', () => {
        const items = firmDataProvenance(FirmId.FtmoFutures).openItems;
        expect(
            items.some((item) => item.includes('bulk adversarial-verifier')),
        ).toBe(false);
    });

    it('lists the Alpha Futures audit questions U30 and U31', () => {
        const items = firmDataProvenance(FirmId.AlphaFutures).openItems;
        expect(items.some((item) => item.startsWith('U30'))).toBe(true);
        expect(items.some((item) => item.startsWith('U31'))).toBe(true);
    });

    it('lists the TopStep audit questions U32 and U33 and the audit item N-53', () => {
        const items = firmDataProvenance(FirmId.TopStep).openItems;
        expect(items.some((item) => item.startsWith('U32'))).toBe(true);
        expect(items.some((item) => item.startsWith('U33'))).toBe(true);
        expect(items.some((item) => item.startsWith('N-53'))).toBe(true);
    });

    it('lists the FundedNext audit question U29 and the E8 audit item N-40', () => {
        const fundedNext = firmDataProvenance(FirmId.FundedNext).openItems;
        const e8 = firmDataProvenance(FirmId.E8Futures).openItems;
        expect(fundedNext.some((item) => item.startsWith('U29'))).toBe(true);
        expect(e8.some((item) => item.startsWith('N-40'))).toBe(true);
    });

    it.each([
        [FirmId.Apex, 'apextraderfunding.com'],
        [FirmId.Mffu, 'Simulated Trader Agreement'],
        [FirmId.Lucid, 'Lucid Trader Agreement'],
        [FirmId.FtmoFutures, 'configurator'],
    ])(
        'names the open paste request that blocks a modeled %s figure',
        (firmId, needle) => {
            const items = firmDataProvenance(firmId).openItems;
            expect(items.some((item) => item.includes(needle))).toBe(true);
        },
    );

    it('ends every open item with the parenthesised source it comes from', () => {
        for (const firmId of Object.values(FirmId)) {
            for (const item of firmDataProvenance(firmId).openItems) {
                expect(item, firmId).toMatch(
                    /\([^()]*(\.md|audit tracker|PLAN\.md)[^()]*\)$/u,
                );
            }
        }
    });

    it('lists the Tradeify audit questions U12 and U27 and the Lightning consistency ladder conflict', () => {
        const items = firmDataProvenance(FirmId.Tradeify).openItems;
        expect(items.some((item) => item.startsWith('U12'))).toBe(true);
        expect(items.some((item) => item.startsWith('U27'))).toBe(true);
        expect(
            items.some(
                (item) =>
                    item.includes('Lightning') && item.includes('20/25/30%'),
            ),
        ).toBe(true);
    });

    it('keeps every open item non-empty and unique within its firm', () => {
        for (const firmId of Object.values(FirmId)) {
            const items = firmDataProvenance(firmId).openItems;
            for (const item of items) {
                expect(item.trim().length, firmId).toBeGreaterThan(0);
            }
            expect(new Set(items).size, firmId).toBe(items.length);
        }
    });

    it('returns the same entry object on repeated calls (no re-derivation per call)', () => {
        expect(firmDataProvenance(FirmId.Mffu)).toBe(
            firmDataProvenance(FirmId.Mffu),
        );
    });
});
