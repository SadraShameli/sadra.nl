import { describe, expect, it } from 'vitest';

import {
    E8FuturesVariant,
    FirmId,
    FtmoFuturesVariant,
    FundedNextVariant,
    InstrumentSymbol,
    TradeifyVariant,
    TradingFirm,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    ALL_FIRMS,
    buildMffuRapidLivePlan,
    findFirm,
    LIVE_PLAN_BUILDERS,
} from '~/lib/prop-calculator/firms';
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

    it('AlphaFutures documents the TRADINGVIEW code at its confirmed 50% and the lower-confidence DIRECT35 secondary offer with its percentage and all-four-sizes scoping', () => {
        const notes = findFirm(FirmId.AlphaFutures)?.notes ?? [];
        expect(
            notes.some((note) => note.includes('50% off all evaluations')),
        ).toBe(true);
        expect(notes.some((note) => note.includes('DIRECT35 (35% off)'))).toBe(
            true,
        );
        expect(
            notes.some((note) =>
                note.includes('all four Direct Qualified sizes'),
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

    it('Apex documents the SAVENOW scope with its confirmed percentage, the March 1, 2026 fee-model change, and the product-picker 5-Pack bundle prices', () => {
        const notes = findFirm(FirmId.Apex)?.notes ?? [];
        expect(notes.some((note) => note.includes('up to 90% off'))).toBe(true);
        expect(notes.some((note) => note.includes('March 1, 2026'))).toBe(true);
        expect(
            notes.some((note) => note.includes('5-Pack Evaluation Bundle')),
        ).toBe(true);
    });

    it('Apex drops the unsourced SAVENOW exclusion from resets and PA activation fees and cites the Coupon Codes article instead (N-33)', () => {
        const notes = findFirm(FirmId.Apex)?.notes ?? [];
        const savenowNote = notes.find((note) => note.includes('SAVENOW'));
        for (const note of notes) {
            expect(note).not.toContain(
                'excluded from resets and PA activation fees',
            );
        }
        expect(savenowNote).toContain(
            "No source read states whether SAVENOW also discounts the PA activation fee: the Coupon Codes help article says 'coupon codes cannot be applied retroactively'",
        );
        expect(savenowNote).toContain(
            'a discounted PA Activation Fee does not travel with an Evaluation purchased during a promotion',
        );
        expect(savenowNote).toContain(
            'Apex sells no resets (a failed Evaluation is re-bought), so under decision T9 the --eval-discount percentage prices those re-buys too',
        );
    });

    it('Apex says a re-buy after the SAVENOW expiry is still priced at the --eval-discount rate under T9, so it is under-priced (N-33)', () => {
        const savenowNote = findFirm(FirmId.Apex)?.notes.find((note) =>
            note.includes('SAVENOW'),
        );
        expect(savenowNote).toContain(
            'The simulation has no calendar dates, so a re-buy made after the code expires on 2026-09-27 is still priced at the --eval-discount rate under decision T9, below the no-code price it would then cost: keeping the SAVENOW percentage under-prices every such re-buy',
        );
    });

    it('Apex lists the No Activation Fee Intraday 5-Pack prices from the product picker (N-33)', () => {
        const packNote = findFirm(FirmId.Apex)?.notes.find((note) =>
            note.includes('5-Pack Evaluation Bundle'),
        );
        expect(packNote).toContain(
            'No Activation Fee Intraday 25K $2,950, 50K $3,450, 100K $4,450, 150K $8,950',
        );
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

    it('Lucid fee note names the undiscountable add-on and promo on evals and resets, and no longer says --eval-discount scales the combined price (N-52)', () => {
        const notes = findFirm(FirmId.Lucid)?.notes ?? [];
        const feeNotes = notes.filter((note) => note.startsWith('Fee basis'));
        expect(feeNotes).toHaveLength(1);
        const [feeNote = ''] = feeNotes;
        expect(feeNote).toContain('undiscountableEval');
        expect(feeNote).toContain('undiscountableReset');
        expect(feeNote).toContain(
            'Pro no-DLL at 30% is 172 x 0.7 + 20 = $140.40',
        );
        expect(
            notes.some((note) =>
                note.includes('scales the combined checkout price'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes('never the no-DLL add-on or a reset). Resets'),
            ),
        ).toBe(false);
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

    it('TopStep LFA notes describe the shipped live model (R-10): the $1,000 static floor, seed payouts, the Reserve, the capital channel and the liquidation payout', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        const stale = [
            'liveDrawdown is null',
            'no bust condition at all',
            'liveBustProbability/medianDaysToBust are always 0/null',
            'Not modeled yet: payouts drawn from the unlocked part of the seed balance',
            'currently unmodeled because it hasn',
        ];
        for (const phrase of stale) {
            expect(notes.some((note) => note.includes(phrase))).toBe(false);
        }
        const lfaNote = notes.find((note) =>
            note.includes('Live Funded Account (modeled in TopStepLive.ts'),
        );
        expect(lfaNote).toBeDefined();
        for (const phrase of [
            'StaticDrawdown',
            'The remaining balance would then be sent as a final Payout.',
            'Unlocked reserve is forfeited',
            'Once 100% of your balance has been unlocked, you may withdraw those funds as well',
            'capital returned',
            'never annualized',
            'Friday',
            'the 90/10 split on withdrawn seed, Reserve and the liquidation payout is an assumption',
            'remaining daily loss limit',
        ]) {
            expect(lfaNote).toContain(phrase);
        }
    });

    it('TopStep LFA notes describe the net-trading-profit tier basis, the wired lot caps and the Daily Loss Limit Safeguard (WP18g: N-57, N-58)', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        for (const phrase of [
            'are NOT wired into an actual ContractLimitConfig',
            'a Friday-only safeguard that drops the DLL further',
            'can incorrectly tier the account back down',
            'the Friday DLL safeguard is listed below as unmodeled',
        ]) {
            expect(notes.some((note) => note.includes(phrase))).toBe(false);
        }
        const lfaNote = notes.find((note) =>
            note.includes('Live Funded Account (modeled in TopStepLive.ts'),
        );
        for (const phrase of [
            "Payouts don't affect your Tier.",
            'It is not currently available for the Live Funded Account.',
            'Tradable balance at or below $5,000 -> DLL drops to $1,000, Max Position Size = 3',
            'relaxes only at a Friday close',
            'the LFA opens on a Monday',
            'The safeguard reads the balance in whole cents',
        ]) {
            expect(lfaNote).toContain(phrase);
        }
    });

    it('TopStep LFA notes describe the end-of-day tier timing with 10 Active Trading Days per tier and the Safeguard reading after a Reserve deposit (WP18h: N-59)', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        for (const phrase of [
            'has no day-count concept and applies the new tier',
            "the new tier's DLL also applies intraday",
            'Two mechanics of the real tiering rule are deliberately simplified',
        ]) {
            expect(notes.some((note) => note.includes(phrase))).toBe(false);
        }
        const lfaNote = notes.find((note) =>
            note.includes('Live Funded Account (modeled in TopStepLive.ts'),
        );
        for (const phrase of [
            'Your Daily Loss Limit increases at end of day after 10 Active Trading Days in the new Tier.',
            'If you drop out of a Tier before 10 days, the counter resets when you re-enter it.',
            'You must move one Tier at a time. No skipping.',
            'Active Trading Day: Any day you place at least 1 trade',
            'TierBasis.SessionOpenProfit',
            'after any Reserve increment that lands at that close',
            'Three readings are this engine',
            'a tier that was already unlocked and is lost at a close must be earned again with 10 new Active Trading Days when the profit re-enters it',
        ]) {
            expect(lfaNote).toContain(phrase);
        }
    });

    it('no firm note names the retired resolveContractLimit; the contract-limit notes name contractLimitAt instead (WP21b)', () => {
        const offenders = ALL_FIRMS.flatMap((firm) =>
            firm.notes
                .filter((note) => note.includes('resolveContractLimit'))
                .map(() => firm.id),
        );
        expect(offenders).toEqual([]);
        for (const firm of [
            FirmId.AlphaFutures,
            FirmId.FtmoFutures,
            FirmId.TopStep,
            FirmId.Tradeify,
        ]) {
            expect(
                findFirm(firm)?.notes.some((note) =>
                    note.includes('contractLimitAt'),
                ),
            ).toBe(true);
        }
    });

    it("notes that describe Tradeify's scaling daily loss limit name its PeakIntradayProfit tier basis, never PeakSessionCloseProfit, across every firm (WP21b, WP23)", () => {
        const subject = "Tradeify's scaling daily loss limit uses TierBasis.";
        const stale = ALL_FIRMS.filter((firm) =>
            firm.notes.some((note) =>
                note.includes(`${subject}PeakSessionCloseProfit`),
            ),
        ).map((firm) => firm.id);
        expect(stale).toStrictEqual([]);
        for (const firm of [FirmId.E8Futures, FirmId.Lucid, FirmId.TopStep]) {
            expect(
                findFirm(firm)?.notes.some((note) =>
                    note.includes(`${subject}PeakIntradayProfit`),
                ),
            ).toBe(true);
        }
    });

    it('Tradeify keeps one Select contract-scaling note, not two overlapping ones (WP21b)', () => {
        const notes = findFirm(FirmId.Tradeify)?.notes ?? [];
        const selectTierNotes = notes.filter((note) =>
            note.includes('SELECT_CONTRACT_LIMITS'),
        );
        expect(selectTierNotes).toHaveLength(1);
        const [selectTierNote = ''] = selectTierNotes;
        for (const phrase of [
            '2/20 from $0 profit, 3/30 from $1,500, 4/40 from $2,000',
            'TierBasis.PeakSessionCloseProfit',
            'Scaling triggers are cumulative',
            'Growth and Lightning',
        ]) {
            expect(selectTierNote).toContain(phrase);
        }
    });

    it("Lucid's Flex DLL note cites the pasted homepage config's per-tier figures instead of calling $1,200 an unconfirmed analogy (WP21b)", () => {
        const notes = findFirm(FirmId.Lucid)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes(
                    "Flex's own dollar figure is NOT independently confirmed anywhere",
                ),
            ),
        ).toBe(false);
        expect(
            notes.some((note) => note.includes('an assumption by analogy')),
        ).toBe(false);
        const toggleNote = notes.find((note) =>
            note.includes('purchasable Daily Loss Limit toggle'),
        );
        expect(toggleNote).toContain('$600/$1,200/$1,800/$2,700');
        expect(toggleNote).toContain('LucidPricingConfig');
    });

    it('TopStep notes use no em dashes', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        expect(notes.some((note) => note.includes('\u{2014}'))).toBe(false);
    });

    it('Lucid notes name the prop live route to the LucidDaily transition credit (R-4)', () => {
        const notes = findFirm(FirmId.Lucid)?.notes ?? [];
        expect(
            notes.some((note) =>
                note.includes('it is reachable by direct construction'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes(
                    'prop live --firm lucid --transition-profit <amount>',
                ),
            ),
        ).toBe(true);
    });

    it('TopStep notes name only identifiers that still exist: the shared TOPSTEP_PAYOUT_POLICY, never the deleted TRADER_SHARE', () => {
        const notes = findFirm(FirmId.TopStep)?.notes ?? [];
        expect(notes.some((note) => note.includes('TRADER_SHARE'))).toBe(false);
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
        expect(
            notes.some((note) => note.includes('5% on a first order')),
        ).toBe(true);
        expect(notes.some((note) => note.includes('$160 -> $120'))).toBe(false);
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

    it('the Alpha Qualified Reset note states how optimize dp values the reset, never that it does not model it (N-34, WP24)', () => {
        const notes = findFirm(FirmId.AlphaFutures)?.notes ?? [];
        const resetNote = notes.find((note) =>
            note.startsWith('The Qualified Account Reset'),
        );

        expect(resetNote).toBeDefined();
        expect(resetNote).not.toContain('does not model the reset');
        expect(resetNote).toContain(
            "optimize dp values the Qualified Reset exactly: a breach before the first payout is worth the next reset layer's start value less the discounted reset fee, and an inactivity closure is never reset",
        );
    });

    it('no firm note names the deleted tryFundedPayout; payout notes name FundedCycleTracker.tryPayout instead (WP24)', () => {
        const notes = ALL_FIRMS.flatMap((firm) => firm.notes);

        expect(notes.some((note) => note.includes('tryFundedPayout'))).toBe(
            false,
        );
        for (const firmId of [FirmId.E8Futures, FirmId.Lucid]) {
            expect(
                (findFirm(firmId)?.notes ?? []).some((note) =>
                    note.includes('FundedCycleTracker.tryPayout'),
                ),
            ).toBe(true);
        }
    });
});

function firmNotes(firmId: FirmId): readonly string[] {
    const firm = findFirm(firmId);
    if (firm === undefined) throw new Error(`firm ${firmId} not registered`);
    return firm.notes;
}

function firmPlans(firmId: FirmId): TradingFirm['plans'] {
    const firm = findFirm(firmId);
    if (firm === undefined) throw new Error(`firm ${firmId} not registered`);
    return firm.plans;
}

function hasNoteContaining(firmId: FirmId, phrase: string): boolean {
    return firmNotes(firmId).some((note) => note.includes(phrase));
}

function noteOf(firmId: FirmId, marker: string): string {
    const note = firmNotes(firmId).find((candidate) =>
        candidate.includes(marker),
    );
    if (note === undefined) {
        throw new Error(`no ${firmId} note contains "${marker}"`);
    }
    return note;
}

describe('firm notes match the current engine (WP26 notes audit)', () => {
    it('no firm note says an unset minPayoutRequest inherits minPayoutProfit, since the Plan default is $0', () => {
        const offenders = ALL_FIRMS.filter((firm) =>
            firm.notes.some((note) => note.includes('inherit minPayoutProfit')),
        ).map((firm) => firm.id);

        expect(offenders).toStrictEqual([]);
        for (const firmId of [
            FirmId.Apex,
            FirmId.Lucid,
            FirmId.Mffu,
            FirmId.Tradeify,
        ]) {
            expect(
                hasNoteContaining(firmId, 'minPayoutRequest defaults to $0') ||
                    hasNoteContaining(firmId, 'default to $0'),
            ).toBe(true);
        }
    });

    it('no firm note says the engine lacks an eval/funded idle-day split, and the notes that rely on it name evalMaxConsecutiveIdleDays', () => {
        const offenders = ALL_FIRMS.filter((firm) =>
            firm.notes.some(
                (note) =>
                    note.includes('no eval/funded split') ||
                    note.includes('no eval/funded phase split'),
            ),
        ).map((firm) => firm.id);

        expect(offenders).toStrictEqual([]);
        for (const [firmId, evalIdleDays, fundedIdleDays] of [
            [FirmId.Apex, 30, 30],
            [FirmId.TopStep, null, 31],
            [FirmId.Tradeify, 7, 7],
        ] as const) {
            expect(
                hasNoteContaining(firmId, 'evalMaxConsecutiveIdleDays'),
            ).toBe(true);
            const plans = firmPlans(firmId).filter(
                (plan) => !plan.isInstantFunded,
            );
            expect(plans.length).toBeGreaterThan(0);
            for (const plan of plans) {
                expect(plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval)).toBe(
                    evalIdleDays,
                );
                expect(
                    plan.maxConsecutiveIdleDaysFor(TradingPhase.Funded),
                ).toBe(fundedIdleDays);
            }
        }
    });

    it('no firm note uses an em dash', () => {
        const offenders = ALL_FIRMS.filter((firm) =>
            firm.notes.some((note) => note.includes('\u{2014}')),
        ).map((firm) => firm.id);

        expect(offenders).toStrictEqual([]);
    });

    it('Alpha Futures live note counts the other live-plan firms from the registry and describes the shared payoutFloor settings and the DLL choice', () => {
        const note = noteOf(FirmId.AlphaFutures, 'AlphaFuturesLive.ts');
        const otherLiveFirms = LIVE_PLAN_BUILDERS.keys()
            .filter((firmId) => firmId !== FirmId.AlphaFutures)
            .toArray();

        expect(note).toContain(`used by ${otherLiveFirms.length} other firms`);
        expect(note).toContain('the same two settings TptLive.ts uses');
        expect(note).not.toContain('more permissive formula than TptLive.ts');
        expect(note).not.toContain('XOR');
        expect(note).toContain(
            'LivePlan itself accepts a liveDailyLossLimit alongside liveDrawdown',
        );
        expect(note).not.toContain(' -- ');
    });

    it('Alpha Futures DIRECT35 note calls it a third typed code applied to no list price', () => {
        const note = noteOf(FirmId.AlphaFutures, 'DIRECT35');

        expect(note).toContain('a third typed code, DIRECT35 (35% off)');
        expect(note).not.toContain('sitewide TRADINGVIEW figure');
        expect(note).toContain('not applied to the list prices');
    });

    it('E8 Zero lock note puts the lock on the Performance-stage fundedDrawdown only', () => {
        const note = noteOf(FirmId.E8Futures, 'LockAtPlanFloor added on top');

        expect(note).toContain(
            "E8 Zero's Performance-stage drawdown (fundedDrawdown) locks",
        );
        expect(note).toContain('the Challenge-stage drawdown never locks');
        expect(note).not.toContain(' -- ');
    });

    it('FTMO retry note names plan.retryFee and the reset-or-re-buy choice, not fees.reset alone', () => {
        const note = noteOf(FirmId.FtmoFutures, 'runEvalWithRetries');

        expect(note).toContain('charges plan.retryFee on every failed');
        expect(note).toContain('retryPath');
        expect(note).not.toContain('charges fees.reset');
        expect(note).toContain('--monthly-discount');
    });

    it('FTMO daily loss limit note lists two open gaps and states the commission-aware per-trade cap', () => {
        const note = noteOf(FirmId.FtmoFutures, 'DailyLossLimitBreachEffect');

        expect(note).toContain(
            'Two gaps remain and must not be read as fixed.',
        );
        expect(note).not.toContain('Three gaps remain');
        expect(note).not.toContain('one round-trip commission past the limit');
        expect(note).toContain('closes exactly on the $1,000 limit');
        expect(note).not.toContain('(3)');
        expect(note).not.toContain('sums past $1,000');
    });

    it('FTMO retained-cushion note says a run can raise the $2,000 floor but never lower it', () => {
        const note = noteOf(FirmId.FtmoFutures, 'minRetainedCushionOverride');

        expect(note).not.toContain('so any run can lower it');
        expect(note).toContain('never lower it below $2,000');
        for (const variant of [
            FtmoFuturesVariant.Growth,
            FtmoFuturesVariant.Pro,
        ]) {
            const plan = findFirm(FirmId.FtmoFutures)?.findPlan({
                accountSize: 50_000,
                firm: FirmId.FtmoFutures,
                variant,
            });
            expect(plan?.resolveRetainedCushion(0)).toBe(2000);
        }
    });

    it('FundedNext notes state the current Rapid Daily limits, the Rapid Pro day gate basis, the Flex comparisons and the uncapped CLI copy count', () => {
        const notes = firmNotes(FirmId.FundedNext);
        for (const stale of [
            'MyFundedFutures Pro=10',
            "Rapid Daily's equivalent contract-limit figures were not visible on the same page pass and are left unset",
            'the highest split of any plan modeled in this codebase',
            'mirroring the identical pattern already used by Legacy/Rapid Pro/Rapid Daily',
            'With maxFundedAccounts at 5 only the 5th-account 15% can apply in the engine',
        ]) {
            expect(notes.some((note) => note.includes(stale))).toBe(false);
        }
        for (const current of [
            'PayoutDayGateBasis.QualifyingDaysSincePassOrPayout',
            'the highest split of any FundedNext funded plan modeled here',
            'the same figures Rapid Pro uses',
            "the CLI's --copy-accounts is not capped at maxFundedAccounts",
        ]) {
            expect(notes.some((note) => note.includes(current))).toBe(true);
        }
    });

    it('FundedNext Flex holds the highest trader share of any FundedNext funded plan, as its note says', () => {
        const firm = findFirm(FirmId.FundedNext);
        const flex = firm?.findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Flex,
        });
        const shares = (firm?.plans ?? []).flatMap((plan) =>
            plan.payoutTiers.map((tier) => tier.traderShare),
        );

        expect(flex?.payoutTiers[0]?.traderShare).toBe(Math.max(...shares));
    });

    it('Lucid notes match the ProNoDll, LucidLive, LucidDirect, LucidMaxx and LucidDaily code', () => {
        const notes = firmNotes(FirmId.Lucid);
        for (const stale of [
            'both LucidVariant.Pro and LucidVariant.ProNoDll therefore share',
            "keys LucidLive's tiered contract limits on raw balance",
            'Corrected to 5, the same payout-cadence-never-wired',
            'left unset (the sensible default',
            '$0 minPayoutRequest floor of $500',
            'closing the exact gap the previous note flagged',
            '(see their own notes above)',
            'across every plan and every DLL/drawdown variant;',
            'rather than left to silently inherit',
            'fell back to TierBasis.LiveProfit',
        ]) {
            expect(notes.some((note) => note.includes(stale))).toBe(false);
        }
        for (const current of [
            'LucidVariant.ProNoDll gets flatDailyLossLimitOf(null)',
            'read at the session open through TierBasis.SessionOpenProfit',
            'so the engine now sets it to 0',
            'evalDailyLossLimit, a required field, is set to DailyLossLimitKind.None',
            'the $500 minPayoutRequest floor',
            'an earlier version of the previous note flagged as deliberately unbuilt',
            '(see their own notes below)',
            'while LucidMaxx, added later, leaves contractLimits unset',
        ]) {
            expect(notes.some((note) => note.includes(current))).toBe(true);
        }
    });

    it('the Lucid live note says the lower COMEX limits cannot apply, because the engine has no COMEX instrument, only ES, MNQ and NQ (N-68, N-5)', () => {
        const note = noteOf(FirmId.Lucid, 'LucidLive (live.md)');

        expect(Object.values(InstrumentSymbol)).toStrictEqual([
            InstrumentSymbol.ES,
            InstrumentSymbol.MNQ,
            InstrumentSymbol.NQ,
        ]);
        expect(note).toContain(
            'the engine has no COMEX instrument (its instruments are ES, MNQ and NQ only), so the lower COMEX limits cannot apply to any modeled trade',
        );
        expect(note).not.toContain('overstates the size available on metals');
    });

    it('TopStep notes describe the current withdrawableAmount, the FTMO cushion override and the Consistency day gate', () => {
        const notes = firmNotes(FirmId.TopStep);
        for (const stale of [
            'Replaced with LivePlan.withdrawableAmount(state),',
            "so every other firm's conservative floor is unaffected",
            'or a 40% consistency check with no profit floor at all',
        ]) {
            expect(notes.some((note) => note.includes(stale))).toBe(false);
        }
        for (const current of [
            'Replaced with LivePlan.withdrawableAmount(state, retainedCushion)',
            'FTMO Futures also sets its own override',
            '3 trading days plus a 40% consistency check',
        ]) {
            expect(notes.some((note) => note.includes(current))).toBe(true);
        }
    });

    it('Take Profit Trader notes name the unset fundedReset and LivePlan.maxContractsFor', () => {
        const notes = firmNotes(FirmId.Tpt);

        expect(
            notes.some((note) =>
                note.includes(
                    "this engine's replacement model for a busted funded account is already a fresh eval cycle",
                ),
            ),
        ).toBe(false);
        expect(
            notes.some((note) =>
                note.includes('this plan sets no fundedReset'),
            ),
        ).toBe(true);
        expect(
            (findFirm(FirmId.Tpt)?.plans ?? []).every(
                (plan) => plan.fundedReset === null,
            ),
        ).toBe(true);
        expect(
            notes.some((note) =>
                note.includes('LivePlan.contractLimits, branching'),
            ),
        ).toBe(false);
        expect(
            notes.some((note) => note.includes('LivePlan.maxContractsFor')),
        ).toBe(true);
    });

    it('Tradeify notes describe the Lucid DLL toggle as modeled and the Lightning reset figure as display-only', () => {
        const notes = firmNotes(FirmId.Tradeify);
        for (const stale of [
            "the same judgement call already made for Lucid's DLL toggle",
            "MyFundedFutures' Flex DLL add-on",
            'reused as the effective cost of purchasing a replacement account',
            'was not independently re-audited this pass',
        ]) {
            expect(notes.some((note) => note.includes(stale))).toBe(false);
        }
        expect(
            notes.some((note) =>
                note.includes('that the engine never charges'),
            ),
        ).toBe(true);
        const lightning = findFirm(FirmId.Tradeify)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        });
        expect(lightning?.isInstantFunded).toBe(true);
    });
});

describe('MFF T17 note and FundedNext reset offer-basis disclosure (WP32: N-19, N-49)', () => {
    it('MFF Rapid Live states that a balance exactly on the MLL closes the account (decision T17), and the live plan does so', () => {
        const note = noteOf(
            FirmId.Mffu,
            'Rapid Live (modeled in MffuRapidLive.ts',
        );
        expect(note).toContain(
            'a balance exactly on the MLL is a closure in this engine (decision T17)',
        );
        const plan = buildMffuRapidLivePlan();
        const state = plan.initialState();
        state.threshold = 0;
        state.thresholdLocked = true;
        state.balance = 0;
        expect(plan.isBust(state)).toBe(true);
        state.balance = 0.01;
        expect(plan.isBust(state)).toBe(false);
    });

    it("FundedNext's fee note says article 14260538's worked example frames the Flex $77.99 reset as the offer price plus $8", () => {
        const note = noteOf(
            FirmId.FundedNext,
            'FundedNext 50K fees are the no-code checkout price',
        );
        expect(note).toContain(
            "article 14260538's own worked example frames the Flex 50K $77.99 reset as the $69.99 offer price plus $8",
        );
        expect(note).toContain(
            'a reset bought without a promo code may cost more',
        );
    });

    it('the Flex note carries the same offer-basis caveat on its $77.99 reset, which is the modeled fee', () => {
        const note = noteOf(
            FirmId.FundedNext,
            'Flex is a fourth FundedNext Futures product',
        );
        expect(note).toContain(
            "$77.99 reset fee (article 14260538's published Reset Price, apparently an offer-basis price; see the fee note)",
        );
        const flex = findFirm(FirmId.FundedNext)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Flex,
        });
        expect(flex?.fees.reset).toBe(77.99);
    });

    it("no FundedNext note claims the reset article's worked examples use older figures than its table", () => {
        expect(
            hasNoteContaining(
                FirmId.FundedNext,
                'worked examples use older figures than its own table',
            ),
        ).toBe(false);
        const note = noteOf(
            FirmId.FundedNext,
            'The FundedNext reset fee is not the eval fee',
        );
        expect(note).toContain(
            'The Flex example uses the current Flex eval and reset figures, framed as the offer price plus a fixed amount',
        );
    });

    it('FundedNext notes cite the reset article at its 2026-09-25 revision', () => {
        expect(
            hasNoteContaining(FirmId.FundedNext, 'dateModified 2026-09-03'),
        ).toBe(false);
        expect(
            hasNoteContaining(
                FirmId.FundedNext,
                "14260538's Reset Price column (dateModified 2026-09-25",
            ),
        ).toBe(true);
    });
});
