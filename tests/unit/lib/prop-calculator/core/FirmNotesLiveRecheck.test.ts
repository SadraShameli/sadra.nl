import { describe, expect, it } from 'vitest';

import { E8FuturesVariant, FirmId } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function firmNotes(firmId: FirmId): readonly string[] {
    const firm = findFirm(firmId);
    if (firm === undefined) throw new Error(`firm ${firmId} not registered`);
    return firm.notes;
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

describe('WP64 E8 Signature list price (T-29, 2026-10-02: balances.50000.price 170)', () => {
    const signature = findFirm(FirmId.E8Futures)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });

    it('models the Signature 50K evaluation fee and reset at the configurator list price of $170', () => {
        if (signature === undefined) throw new Error('Signature plan missing');
        expect(signature.fees.oneTimeEval).toBe(170);
        expect(signature.fees.reset).toBe(170);
    });

    it('no E8 note still calls $160 the current Signature price, and one states $170 as the list price', () => {
        expect(
            firmNotes(FirmId.E8Futures).filter(
                (note) =>
                    note.includes("Signature's $160") ||
                    note.includes('$160 -> $120'),
            ),
        ).toStrictEqual([]);
        const note = noteOf(FirmId.E8Futures, 'balances.50000.price');
        expect(note).toContain('$170');
        expect(note).toContain('re-read 2026-10-02');
    });

    it("the Zero note's fee basis names Signature's $170", () => {
        expect(noteOf(FirmId.E8Futures, "same basis as Signature's")).toContain(
            "same basis as Signature's $170",
        );
    });
});

describe('WP64 E8 code notes (T-30)', () => {
    it('states what the configurator, the codes page and the homepage show and that no typed code lowers the modeled fee', () => {
        const note = noteOf(FirmId.E8Futures, 'Coupon code "E8"');
        expect(note).toContain('5% on a first order');
        expect(note).toContain('25%');
        expect(note).toContain('Signature');
        expect(note).toContain('REB8');
        expect(note).toContain('35%');
        expect(note).toContain('no typed code lowers the modeled fee');
        expect(note).toContain('--eval-discount');
        expect(note).not.toContain('$160 -> $120');
        expect(note).not.toContain('$328 -> $214');
    });

    it('the Zero note reports the configurator, codes page and homepage figures of 2026-10-02', () => {
        const note = noteOf(FirmId.E8Futures, "same basis as Signature's");
        expect(note).toContain('5% on a first order');
        expect(note).toContain('REB8');
        expect(note).not.toContain('35% via code E8 on the configurator');
    });
});

describe('WP64 FTMO Futures notes (T-1, T-4)', () => {
    const notes = firmNotes(FirmId.FtmoFutures);

    it("T-1: the reset note uses the firm's 'sooner', not 'immediately'", () => {
        const note = noteOf(FirmId.FtmoFutures, 'runEvalWithRetries');
        expect(note).toContain(
            'sooner, without purchasing a new account or waiting for the next billing period',
        );
        expect(note).not.toContain('or immediately for the Reset Fee');
    });

    it('T-4: discloses that passing does not guarantee Sim-Funded acceptance and that the offer may be time-limited', () => {
        const note = noteOf(FirmId.FtmoFutures, 'does not guarantee');
        expect(note).toContain('cl. 5.10');
        expect(note).toContain('cl. 6.2');
        expect(note).toContain('time-limited');
        expect(note).toContain('assumes');
        expect(notes).toContain(note);
    });
});

describe('WP64 Alpha Futures notes (T-10, T-14)', () => {
    it('T-10: the Advanced Qualified MLL note records the $2,000 against $1,750 conflict and question U31', () => {
        const note = noteOf(FirmId.AlphaFutures, 'Advanced Qualified uses');
        expect(note).toContain('$2,000');
        expect(note).toContain('$1,750');
        expect(note).toContain('11634907');
        expect(note).toContain('U31');
        expect(note).toContain('pending');
    });

    it('T-14: the code note names ALPHA40 as the only code on the code page and APP50 as no longer current', () => {
        const note = noteOf(FirmId.AlphaFutures, 'APP50');
        expect(note).toContain('ALPHA40');
        expect(note).toContain('2026-10-01');
        expect(note).toContain('lists only one code');
        expect(note).toContain('no longer');
    });

    it('T-14: DIRECT35 is dated as a July 2026 launch offer absent from the code page', () => {
        const note = noteOf(FirmId.AlphaFutures, 'DIRECT35');
        expect(note).toContain('2026-07-10');
        expect(note).toContain('absent from');
        expect(note).toContain('2026-10-01');
    });

    it('T-14: DIRECT35 is described as covering all four Direct Qualified sizes, not only the $50K account', () => {
        const note = noteOf(FirmId.AlphaFutures, 'DIRECT35');
        expect(note).toContain('all four Direct Qualified sizes');
        expect(note).toContain('$25K, $50K, $100K, $150K');
        expect(note).not.toContain('scoped to the $50K');
    });
});

describe('WP64 Take Profit Trader notes (T-23, T-25)', () => {
    it('T-23: no note asserts that no minimum payout request exists', () => {
        expect(
            firmNotes(FirmId.Tpt).filter((note) =>
                note.includes('No minimum payout request size exists'),
            ),
        ).toStrictEqual([]);
    });

    it("T-23: the minimum-withdrawal note cites the dashboard's error text and calls $0.01 the tool's reading", () => {
        const note = noteOf(
            FirmId.Tpt,
            'Withdrawal amount is below the minimum allowed',
        );
        expect(note).toContain('Withdrawal Fees');
        expect(note).toContain('$0.01');
        expect(note).toContain("the tool's reading");
        expect(note).toContain('$50');
        expect(note).toContain('$250');
    });

    it('T-25: states the PRO 50-executions rule, that it is not modeled and that it binds only above about 25 round trips a day', () => {
        const note = noteOf(FirmId.Tpt, '50 executions');
        expect(note).toContain('not modeled');
        expect(note).toContain('25 round trips');
        expect(note).toContain('PRO');
    });
});

describe('WP64 FundedNext notes (T-33, T-35)', () => {
    it('T-33: the minimum-trading-days reason is that the firm pages state none, not that the pages could not be found', () => {
        expect(
            firmNotes(FirmId.FundedNext).filter((note) =>
                note.includes('could not independently locate'),
            ),
        ).toStrictEqual([]);
        const note = noteOf(
            FirmId.FundedNext,
            'minimum-trading-days requirement for Legacy',
        );
        expect(note).toContain('state no minimum');
        expect(note).toContain('Futures Challenge Terms');
    });

    it("T-35: a note says Legacy's live stage, the Reserve and Auto Liquidation program, is not modeled (R1-47)", () => {
        const note = noteOf(FirmId.FundedNext, 'Reserve and Auto Liquidation');
        expect(note).toContain('Legacy');
        expect(note).toContain('not modeled');
        expect(note).toContain('R1-47');
    });
});
