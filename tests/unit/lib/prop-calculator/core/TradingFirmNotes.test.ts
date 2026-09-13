import { describe, expect, it } from 'vitest';

import { FirmId, TradingFirm } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

class NotesLessFirm extends TradingFirm {
    readonly displayName = 'NotesLessFirm';
    readonly id = FirmId.TopStep;
    readonly plans = [];
    readonly website = 'https://example.invalid';
}

describe('TradingFirm.notes (live-verified 2026-09-10, MFFU only)', () => {
    it('MFFU documents its supported platforms and the Rapid EOD inactivity rule', () => {
        const notes = new MyFundedFutures().notes;
        expect(notes.some((note) => note.includes('NinjaTrader'))).toBe(true);
        expect(notes.some((note) => note.includes('Tradovate'))).toBe(true);
        expect(notes.some((note) => note.includes('7 consecutive'))).toBe(true);
    });

    it('a firm that does not override notes correctly inherits an empty array from TradingFirm, with zero code changes (every registered firm now documents live-verification notes of its own)', () => {
        expect(new NotesLessFirm().notes).toStrictEqual([]);
        for (const firm of [
            FirmId.AlphaFutures,
            FirmId.Apex,
            FirmId.E8Futures,
            FirmId.FundedNext,
            FirmId.Lucid,
            FirmId.Mffu,
            FirmId.TopStep,
            FirmId.Tpt,
            FirmId.Tradeify,
        ]) {
            expect(findFirm(firm)?.notes.length).toBeGreaterThan(0);
        }
    });

    it('FundedNext documents its live-verified minTradingDays fix, the firm-wide inactivity rule, and the payoutFloorEffect gap found on re-audit', () => {
        const notes = findFirm(FirmId.FundedNext)?.notes ?? [];
        expect(
            notes.some((note) => note.includes('minimum-trading-days')),
        ).toBe(true);
        expect(
            notes.some((note) => note.includes('30 consecutive calendar days')),
        ).toBe(true);
        expect(notes.some((note) => note.includes('LockAtPlanFloor'))).toBe(
            true,
        );
    });

    it('FundedNext documents the Rapid Daily dead minPayoutProfit fix and the Rapid Pro payout-cadence fix found on deep re-audit', () => {
        const notes = findFirm(FirmId.FundedNext)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes("Rapid Daily's minPayoutProfit"),
            ),
        ).toBe(true);
        expect(
            notes.some((note) =>
                note.includes("Rapid Pro's minDaysAfterPassForPayout"),
            ),
        ).toBe(true);
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
