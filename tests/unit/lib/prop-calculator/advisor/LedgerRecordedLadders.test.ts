import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator';
import {
    LEDGER_CONTENT_HASH,
    LEDGER_FILE,
    LEDGER_RECORDED_LADDERS,
    LEDGER_SECTION,
    LedgerLadderSelection,
    ledgerRecordedLadderFor,
} from '~/lib/prop-calculator/advisor/LedgerRecordedLadders';
import { StartBasis } from '~/lib/prop-calculator/advisor/StartBasis';

function citedSectionHash(): string {
    const lines = readFileSync(LEDGER_FILE, 'utf8').split('\n');
    const startIndex = lines.indexOf(`## ${LEDGER_SECTION}`);
    if (startIndex === -1) {
        throw new Error(`LEDGER_SECTION heading not found in ${LEDGER_FILE}`);
    }
    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        if (lines[index]?.startsWith('## ')) {
            endIndex = index;
            break;
        }
    }
    const section = lines
        .slice(startIndex, endIndex)
        .join('\n')
        .replace(/\n+$/, '');
    return createHash('sha256').update(section, 'utf8').digest('hex');
}

describe('LEDGER_RECORDED_LADDERS', () => {
    it('has one row per plan, none for the four instant-funded plans', () => {
        expect(LEDGER_RECORDED_LADDERS).toHaveLength(42);
        for (const instant of [
            { firmId: FirmId.FundedNext, variant: 'fnl-003' },
            { firmId: FirmId.Lucid, variant: 'direct' },
            { firmId: FirmId.TopStep, variant: 'pro-account' },
            { firmId: FirmId.Tradeify, variant: 'lightning' },
        ]) {
            expect(
                ledgerRecordedLadderFor(instant.firmId, instant.variant),
            ).toBeNull();
        }
    });

    it('parses the TopStep No-fee Standard row from its cited cell', () => {
        const row = ledgerRecordedLadderFor(FirmId.TopStep, 'no-fee-standard');
        expect(row).toEqual({
            costPerFundedAccount: 223,
            daysToFunded: 5.5,
            ladder: [800, 400, 800, 600],
            passRate: 0.428,
            planKey: { firmId: FirmId.TopStep, variant: 'no-fee-standard' },
            provenance: {
                contentHash: LEDGER_CONTENT_HASH,
                file: LEDGER_FILE,
                row: 'topstep no-fee-standard',
                section: LEDGER_SECTION,
            },
            selection: LedgerLadderSelection.BySpeed,
            stale: false,
            startBasis: StartBasis.Fresh,
        });
    });

    it('parses a 4-digit cost with a thousands separator', () => {
        expect(
            ledgerRecordedLadderFor(FirmId.Apex, 'eod')?.costPerFundedAccount,
        ).toBe(1535);
    });

    it('parses a 3-rung ladder', () => {
        expect(ledgerRecordedLadderFor(FirmId.Tpt, null)?.ladder).toEqual([
            600, 800, 800, 600,
        ]);
        expect(
            ledgerRecordedLadderFor(FirmId.Tradeify, 'select-flex')?.ladder,
        ).toEqual([500, 800, 700]);
    });

    it('marks every current Stage A row not stale, by-speed and a fresh eval start', () => {
        for (const row of LEDGER_RECORDED_LADDERS) {
            expect(row.stale).toBe(false);
            expect(row.selection).toBe(LedgerLadderSelection.BySpeed);
            expect(row.startBasis).toBe(StartBasis.Fresh);
            expect(row.provenance.contentHash).toBe(LEDGER_CONTENT_HASH);
        }
    });

    it('returns null for a plan not in the ledger', () => {
        expect(
            ledgerRecordedLadderFor(FirmId.TopStep, 'not-a-plan'),
        ).toBeNull();
    });

    it('detects drift: LEDGER_CONTENT_HASH matches a fresh hash of the cited section today', () => {
        expect(LEDGER_CONTENT_HASH).toBe(citedSectionHash());
    });
});
