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

    it("MyFundedFutures documents the CLUB coupon code and Builder's separately-confirmed discount tiers", () => {
        const notes = new MyFundedFutures().notes;
        expect(notes.some((note) => note.includes('CODE: CLUB'))).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('Discounted Price (40% OFF - 2 uses only)'),
            ),
        ).toBe(true);
    });

    it('FundedNext documents the FNFLEX/RAPID coupon codes and the reset-fee-priced-off-list-price caveat', () => {
        const notes = findFirm(FirmId.FundedNext)?.notes ?? [];
        expect(notes.some((note) => note.includes('FNFLEX'))).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('reset fee is calculated off list price'),
            ),
        ).toBe(true);
    });

    it('Tradeify documents the standing monthly promo code, the one-time-subscription confirmation, and the banner-artifact caveat', () => {
        const notes = findFirm(FirmId.Tradeify)?.notes ?? [];
        expect(
            notes.some((note) => note.includes('monthly-renamed promo code')),
        ).toBe(true);
        expect(
            notes.some((note) => note.includes("subscription: 'one time'")),
        ).toBe(true);
        expect(notes.some((note) => note.includes('before/after'))).toBe(true);
    });

    it('AlphaFutures documents the TRADINGVIEW code and the lower-confidence DIRECT35 secondary offer', () => {
        const notes = findFirm(FirmId.AlphaFutures)?.notes ?? [];
        expect(notes.some((note) => note.includes('TRADINGVIEW'))).toBe(true);
        expect(notes.some((note) => note.includes('DIRECT35'))).toBe(true);
    });

    it("Take Profit Trader documents the NOFEE40 coupon's exact two-field mechanics", () => {
        const notes = findFirm(FirmId.Tpt)?.notes ?? [];
        expect(notes.some((note) => note.includes('NOFEE40'))).toBe(true);
    });

    it('Apex documents the SAVENOW scope caveat, the March 1, 2026 fee-model change, and the unconfirmed 5-Pack bundle', () => {
        const notes = findFirm(FirmId.Apex)?.notes ?? [];
        expect(notes.some((note) => note.includes('SAVENOW'))).toBe(true);
        expect(notes.some((note) => note.includes('March 1, 2026'))).toBe(true);
        expect(
            notes.some((note) => note.includes('5-Pack Evaluation Bundle')),
        ).toBe(true);
    });

    it('TopStep documents the Responsible Trading Discount as a structural price variant, not a coupon code', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        expect(
            notes.some((note) => note.includes('Responsible Trading Discount')),
        ).toBe(true);
    });

    it('Lucid documents the unconfirmed standing-discount flag', () => {
        const notes = findFirm(FirmId.Lucid)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes('list-vs-discount price display'),
            ),
        ).toBe(true);
    });

    it("E8 Futures documents the E8 coupon's exact eval-fee cut and the confirmed 5-payout lifetime cap", () => {
        const notes = findFirm(FirmId.E8Futures)?.notes ?? [];
        expect(notes.some((note) => note.includes('Coupon code "E8"'))).toBe(
            true,
        );
        expect(notes.some((note) => note.includes('$160 -> $120'))).toBe(true);
        expect(
            notes.some((note) => note.includes('hard 5-payout lifetime cap')),
        ).toBe(true);
    });
});
