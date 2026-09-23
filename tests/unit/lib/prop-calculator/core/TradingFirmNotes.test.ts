import { describe, expect, it } from 'vitest';

import {
    E8FuturesVariant,
    FirmId,
    TradingFirm,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
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
            FirmId.FtmoFutures,
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
        expect(notes.some((note) => note.includes('50%OFF'))).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('Discounted Price (40% OFF - 2 uses only)'),
            ),
        ).toBe(true);
    });

    it('FundedNext documents the FNFLEX/RAPID coupon codes, their confirmed percentages, and the Legacy-exclusion fact', () => {
        const notes = findFirm(FirmId.FundedNext)?.notes ?? [];
        expect(notes.some((note) => note.includes('FNFLEX (~47% off'))).toBe(
            true,
        );
        expect(notes.some((note) => note.includes('RAPID (~43-46% off'))).toBe(
            true,
        );
        expect(
            notes.some((note) =>
                note.includes('Legacy is explicitly not discounted'),
            ),
        ).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('The FundedNext reset fee is not the eval fee'),
            ),
        ).toBe(true);
    });

    it('Tradeify documents the standing monthly promo code and its confirmed 30-50% range, the one-time-subscription confirmation, and the banner-artifact caveat', () => {
        const notes = findFirm(FirmId.Tradeify)?.notes ?? [];
        expect(
            notes.some((note) => note.includes('monthly-renamed promo code')),
        ).toBe(true);
        expect(notes.some((note) => note.includes('30-50% off'))).toBe(true);
        expect(
            notes.some((note) => note.includes("subscription: 'one time'")),
        ).toBe(true);
        expect(notes.some((note) => note.includes('before/after'))).toBe(true);
    });

    it('AlphaFutures documents the TRADINGVIEW code at its confirmed 50% and the lower-confidence DIRECT35 secondary offer with its percentage and $50K scoping', () => {
        const notes = findFirm(FirmId.AlphaFutures)?.notes ?? [];
        expect(
            notes.some((note) => note.includes('50% off all evaluations')),
        ).toBe(true);
        expect(notes.some((note) => note.includes('DIRECT35 (35% off)'))).toBe(
            true,
        );
        expect(
            notes.some((note) =>
                note.includes('$50K "Direct Qualified" account'),
            ),
        ).toBe(true);
    });

    it("Take Profit Trader documents the NOFEE40 coupon's exact two-field mechanics", () => {
        const notes = findFirm(FirmId.Tpt)?.notes ?? [];
        expect(notes.some((note) => note.includes('NOFEE40'))).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('40% off the monthly Test subscription'),
            ),
        ).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('separate 100% activation-fee waiver'),
            ),
        ).toBe(true);
        expect(
            notes.some((note) => note.includes('unlimited/uncapped stacking')),
        ).toBe(true);
    });

    it('Apex documents the SAVENOW scope caveat with its confirmed percentage and exclusion warning, the March 1, 2026 fee-model change, and the unconfirmed 5-Pack bundle', () => {
        const notes = findFirm(FirmId.Apex)?.notes ?? [];
        expect(notes.some((note) => note.includes('up to 90% off'))).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('excluded from resets and PA activation fees'),
            ),
        ).toBe(true);
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

    it('Lucid documents the automatic DLL-ON promo and the no-DLL reset add-on as modeled, and the VAULT code as a typed code', () => {
        const notes = findFirm(FirmId.Lucid)?.notes ?? [];
        expect(notes.some((note) => note.includes('addonPromos'))).toBe(true);
        expect(notes.some((note) => note.includes('VAULT'))).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('resetFee is left unchanged for all three'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes('list-vs-discount price display'),
            ),
        ).toBe(false);
    });

    it('Lucid discloses that --eval-discount scales the combined checkout price, add-on and promo included, unlike the site', () => {
        const notes = findFirm(FirmId.Lucid)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes('never the no-DLL add-on or a reset). Resets'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes(
                    '--eval-discount scales the combined checkout price',
                ),
            ),
        ).toBe(true);
    });

    it('TopStep notes state the published $95 No-fee reset, the LFA payout gate and the confirmed LFA 90/10 split', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes(
                    "this engine's own inference, not a directly quoted figure",
                ),
            ),
        ).toBe(false);
        expect(notes.some((note) => note.includes('Reset Pricing'))).toBe(true);
        expect(
            notes.some((note) => note.includes('30 non-consecutive days')),
        ).toBe(true);
        expect(
            notes.some((note) =>
                note.includes(
                    'TRADER_SHARE = 0.9 (90/10 split) is an unconfirmed assumption',
                ),
            ),
        ).toBe(false);
    });

    it('TopStep notes name only identifiers that still exist: the shared TOPSTEP_PAYOUT_POLICY, never the deleted TRADER_SHARE', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        expect(notes.some((note) => note.includes('TRADER_SHARE'))).toBe(
            false,
        );
        expect(
            notes.some((note) =>
                note.includes('TOPSTEP_PAYOUT_POLICY.traderShare'),
            ),
        ).toBe(true);
    });

    it('TopStep discloses that article 14289835 extends the Responsible Trading Discount to Express Funded Account Activations without a published amount', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes(
                    'the source states the discount only for No Activation Fee Combines',
                ),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes('Express Funded Account Activations'),
            ),
        ).toBe(true);
    });

    it('Tradeify notes match the code: the $109 Select reset, no deleted bulkDiscountFactor, and Apex and TopStep tiers on SessionOpenProfit', () => {
        const notes = findFirm(FirmId.Tradeify)?.notes ?? [];
        expect(notes.some((note) => note.includes('bulkDiscountFactor'))).toBe(
            false,
        );
        expect(
            notes.some((note) =>
                note.includes('defaults to TierBasis.LiveProfit'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes("$99 remains the engine's modeled figure"),
            ),
        ).toBe(false);
        expect(
            notes.some((note) => note.includes("'Select 50K | $165 | $109'")),
        ).toBe(true);
    });

    it('E8 Futures notes match the code: code E8 is not a site-wide 25%, Zero tiers name their TierBasis, and LadderSearch no longer reads plan.drawdown.lock', () => {
        const notes = new E8Futures().notes;
        expect(
            notes.some((note) =>
                note.includes('standing, site-wide 25% discount'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes(
                    'ContractLimitKind.Tiered keyed on accountProfit',
                ),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes('reads plan.drawdown.lock directly'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes('based on locked profit at the end of the day'),
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

    it("E8 Futures states Signature's modeled minPayoutRequest as the $125 gross value, not the stale dollars(100)", () => {
        const firm = new E8Futures();
        const signature = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        });
        if (!signature) throw new Error('E8 Signature 50K plan not found');
        expect(
            firm.notes.some((note) =>
                note.includes('Corrected 2026-09-18 to dollars(100)'),
            ),
        ).toBe(false);
        const note = firm.notes.find((n) =>
            n.startsWith("Signature's minPayoutRequest"),
        );
        expect(note).toContain(`dollars(${signature.minPayoutRequest})`);
        expect(note).not.toContain('to dollars(100)');
    });

    it('E8 Futures notes describe margin-based micro caps and list-price Zero fees, without the superseded premises', () => {
        const notes = new E8Futures().notes;
        expect(
            notes.some((note) =>
                note.includes("doesn't distinguish mini vs micro"),
            ),
        ).toBe(false);
        expect(
            notes.some((note) => note.includes('MAX $214/$279 (80%/100%')),
        ).toBe(false);
        expect(
            notes.some((note) => note.includes('$1,000 per micro contract')),
        ).toBe(true);
        expect(
            notes.some((note) => note.includes('$328/$428 (80%/100% payout)')),
        ).toBe(true);
    });
});
