import { describe, expect, it } from 'vitest';

import {
    type AlphaFuturesVariant,
    findFirm,
    FirmId,
    type Fraction0to1,
    FundedNextVariant,
    InstrumentSymbol,
    type LucidVariant,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator';
import { LiveApplicabilityNote } from '~/lib/prop-calculator/firms';
import {
    LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LIVE_TRANSFER_NOTE_TEXT,
    LiveTransferContinuationKind,
    liveTransferContinuationNotes,
    liveTransferDisclosureLines,
    liveTransferHazardLines,
    liveTransferSentLiveText,
} from '~/lib/prop-calculator/simulator';

function planOf(
    firm: FirmId,
    variant:
        AlphaFuturesVariant | FundedNextVariant | LucidVariant | MffuVariant,
): Plan {
    const plan = findFirm(firm)?.plans.find(
        (candidate) =>
            'variant' in candidate.id && candidate.id.variant === variant,
    );
    if (!plan) throw new Error(`${firm} ${variant} plan not found`);
    return plan;
}

const flex = planOf(FirmId.FundedNext, FundedNextVariant.Flex);
const mffuRapidEod = planOf(FirmId.Mffu, MffuVariant.RapidEod);
const HAZARD = 0.3 as Fraction0to1;

describe('a plan that is not modeled only because its live builder is unverified still shows its note (R-V6 a)', () => {
    it('keeps the FundedNext Flex trigger conflict note beside the valued-at-zero continuation', () => {
        expect(
            liveTransferContinuationNotes(
                flex,
                LiveTransferContinuationKind.NotModeled,
            ),
        ).toEqual([
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.FundedNextFlexTriggerConflict
            ],
        ]);
    });

    it('puts the Flex note after the $0 continuation line in the hazard lines', () => {
        const lines = liveTransferHazardLines(
            flex,
            HAZARD,
            InstrumentSymbol.MNQ,
            10,
        );

        expect(lines).toEqual([
            'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
            LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.FundedNextFlexTriggerConflict
            ],
        ]);
    });

    it('still shows no note for a verified plan that is valued at $0 only for want of an instrument and stop', () => {
        expect(
            liveTransferContinuationNotes(
                mffuRapidEod,
                LiveTransferContinuationKind.NotModeled,
            ),
        ).toEqual([]);
    });
});

describe('the Lucid Daily and Alpha notes say what the tool assumes beyond the firm pages (R-V6 b, c)', () => {
    it('says the Lucid Daily credit is paid net of the 90/10 split, which the live page does not state, and may be paid only after KYC', () => {
        const text =
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash
            ];

        expect(text).toContain('net of the 90/10 split');
        expect(text).toContain('does not state');
        expect(text).toContain('KYC');
        expect(text).not.toContain('\u{2014}');
    });

    it("calls the split the tool's own reading, names the Payouts and Funded Account articles as the pages that state 90/10 for funded accounts, and adds sub account approval to the KYC condition (N-92)", () => {
        const text =
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash
            ];

        expect(text).toContain("this tool's own reading");
        expect(text).toContain('Payouts and Funded Account articles');
        expect(text).not.toContain('only the');
        expect(text).toContain('funded account payouts');
        expect(text).toContain('sub account approval');
    });

    it('says the tool does not model the Scaling Daily Loss Limit both Alpha live programs share', () => {
        const text =
            LIVE_TRANSFER_NOTE_TEXT[LiveApplicabilityNote.AlphaPrimeNotModeled];

        expect(text).toContain('Scaling Daily Loss Limit (30% of account)');
        expect(text).toContain('does not model');
        expect(text).not.toContain('\u{2014}');
    });
});

describe('the share sent live is one sentence in the one hazard wording (PT-73d step 2)', () => {
    it('words the share with the funded horizon', () => {
        expect(liveTransferSentLiveText(0.413)).toBe(
            '41.3% of runs are sent live within the funded horizon.',
        );
    });

    it('inserts the share line right after the assumption line and leaves the lines unchanged without it', () => {
        const withShare = liveTransferHazardLines(
            mffuRapidEod,
            HAZARD,
            InstrumentSymbol.MNQ,
            10,
            0.413,
        );
        const without = liveTransferHazardLines(
            mffuRapidEod,
            HAZARD,
            InstrumentSymbol.MNQ,
            10,
        );

        expect(withShare).toEqual([
            without[0],
            liveTransferSentLiveText(0.413),
            ...without.slice(1),
        ]);
    });

    it('builds the same lines from the plan-free disclosure the typed assumption stores', () => {
        const kind = LiveTransferContinuationKind.Modeled;
        const notes = liveTransferContinuationNotes(mffuRapidEod, kind);

        expect(
            liveTransferDisclosureLines({
                continuation: kind,
                hazard: HAZARD,
                notes,
                sentLiveShare: 0.413,
            }),
        ).toEqual(
            liveTransferHazardLines(
                mffuRapidEod,
                HAZARD,
                InstrumentSymbol.MNQ,
                10,
                0.413,
            ),
        );
    });
});
