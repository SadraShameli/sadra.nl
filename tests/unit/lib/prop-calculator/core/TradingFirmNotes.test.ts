import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

describe('TradingFirm.notes (live-verified 2026-09-10, MFFU only)', () => {
    it('MFFU documents its supported platforms and the Rapid EOD inactivity rule', () => {
        const notes = new MyFundedFutures().notes;
        expect(notes.some((note) => note.includes('NinjaTrader'))).toBe(true);
        expect(notes.some((note) => note.includes('Tradovate'))).toBe(true);
        expect(notes.some((note) => note.includes('7 consecutive'))).toBe(true);
    });

    it('firms with no documented notes correctly inherit an empty array, with zero code changes', () => {
        expect(findFirm(FirmId.TopStep)?.notes).toStrictEqual([]);
        expect(findFirm(FirmId.FundedNext)?.notes).toStrictEqual([]);
    });

    it('Apex, Lucid, and Tradeify document their minPayoutRequest fallback-chain fixes', () => {
        expect(
            findFirm(FirmId.Apex)?.notes.some((note) =>
                note.includes('minPayoutRequest'),
            ),
        ).toBe(true);
        expect(
            findFirm(FirmId.Lucid)?.notes.some((note) =>
                note.includes('minPayoutRequest'),
            ),
        ).toBe(true);
        expect(
            findFirm(FirmId.Tradeify)?.notes.some((note) =>
                note.includes('minPayoutRequest'),
            ),
        ).toBe(true);
    });
});
