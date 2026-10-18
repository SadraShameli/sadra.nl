import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    type Fraction0to1,
    InstrumentSymbol,
    LucidVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { ALL_FIRMS, LiveApplicabilityNote } from '~/lib/prop-calculator/firms';
import {
    LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LIVE_TRANSFER_NOTE_TEXT,
    LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
    LiveTransferContinuationKind,
    liveTransferContinuationKindFor,
    liveTransferContinuationNotes,
    liveTransferHazardLines,
    liveTransferHazardPercentText,
    type LiveTransferOptions,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator/simulator';

import { payoutCapToyPlan } from './toyPlans';

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const mffuRapidEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
const mffuPro = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});
const lucidDirect = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Direct,
});
const apexEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const topStep = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const SIZED = { instrument: InstrumentSymbol.MNQ, stopPoints: 10 } as const;

function textOf(note: LiveApplicabilityNote): string {
    return LIVE_TRANSFER_NOTE_TEXT[note];
}

describe('the continuation kind is knowable without a simulation (PT-73b)', () => {
    it('is Modeled for a verified exact live plan with an instrument and stop', () => {
        expect(
            liveTransferContinuationKindFor(
                mffuRapidEod,
                SIZED.instrument,
                SIZED.stopPoints,
            ),
        ).toBe(LiveTransferContinuationKind.Modeled);
    });

    it('is ModeledApproximate where the live state is partly assumed', () => {
        expect(
            liveTransferContinuationKindFor(
                topStep,
                SIZED.instrument,
                SIZED.stopPoints,
            ),
        ).toBe(LiveTransferContinuationKind.ModeledApproximate);
    });

    it('is NotModeled without an instrument and stop, or where no live plan is modeled', () => {
        expect(
            liveTransferContinuationKindFor(mffuRapidEod, undefined, undefined),
        ).toBe(LiveTransferContinuationKind.NotModeled);
        expect(
            liveTransferContinuationKindFor(
                mffuPro,
                SIZED.instrument,
                SIZED.stopPoints,
            ),
        ).toBe(LiveTransferContinuationKind.NotModeled);
    });

    it('agrees with the kind the engine reports for the same inputs', () => {
        const out = simulate({
            fundedHorizonDays: 30,
            instrument: SIZED.instrument,
            liveTransferHazard: 1 as Fraction0to1,
            maxEvalDays: 5,
            plan: mffuRapidEod,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 1,
            stopPoints: SIZED.stopPoints,
            tradesPerDay: 1,
            trials: 5,
            winrate: 0.5,
        });

        expect(out.liveTransferContinuation).toBe(
            liveTransferContinuationKindFor(
                mffuRapidEod,
                SIZED.instrument,
                SIZED.stopPoints,
            ),
        );
    });
});

describe('the live continuation approximations are disclosed (PT-73b)', () => {
    it('says the continuation ignores the funded day stop and rung sizing wherever it continues the account', () => {
        for (const kind of [
            LiveTransferContinuationKind.Modeled,
            LiveTransferContinuationKind.ModeledApproximate,
        ]) {
            expect(liveTransferContinuationNotes(apexEod, kind)).toContain(
                LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
            );
        }
        expect(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT).toContain(
            'funded day stop',
        );
        expect(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT).toContain('rung sizing');
    });

    it('carries no continuation note where the rest of the account is valued at 0', () => {
        for (const kind of [
            LiveTransferContinuationKind.NotModeled,
            LiveTransferContinuationKind.Off,
        ]) {
            expect(liveTransferContinuationNotes(mffuRapidEod, kind)).toEqual(
                [],
            );
        }
    });

    it('carries the LivePlanApplicability note of the plan, such as the MFFU Rapid EOD live contract limit', () => {
        const notes = liveTransferContinuationNotes(
            mffuRapidEod,
            LiveTransferContinuationKind.Modeled,
        );

        expect(notes).toContain(
            textOf(LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed),
        );
        expect(
            textOf(LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed),
        ).toContain('contract limit');
    });

    it('adds no applicability note for a plan without one', () => {
        expect(
            liveTransferContinuationNotes(
                lucidDirect,
                LiveTransferContinuationKind.Modeled,
            ),
        ).toEqual([LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT]);
    });

    it('words every applicability note and every continuation kind without a dash', () => {
        for (const note of Object.values(LiveApplicabilityNote)) {
            expect(textOf(note).length).toBeGreaterThan(0);
            expect(textOf(note)).not.toContain('\u{2014}');
        }
        for (const kind of Object.values(LiveTransferContinuationKind)) {
            expect(LIVE_TRANSFER_CONTINUATION_TEXT[kind]).not.toContain(
                '\u{2014}',
            );
        }
        expect(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        ).toContain('$0');
        expect(
            LIVE_TRANSFER_CONTINUATION_TEXT[LiveTransferContinuationKind.Off],
        ).toBe('');
    });
});

describe('the hazard fields use a branded probability (PT-73b)', () => {
    it('types the simulation input and the funded-phase option as Fraction0to1', () => {
        expectTypeOf<SimInputs['liveTransferHazard']>().toEqualTypeOf<
            Fraction0to1 | undefined
        >();
        expectTypeOf<
            LiveTransferOptions['hazard']
        >().toEqualTypeOf<Fraction0to1>();
    });
});

describe('the transfer draw is named for what it does (PT-73b)', () => {
    it('keeps no isSentLive predicate that consumes a draw', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'lib',
                'prop-calculator',
                'simulator',
                'fundedPhase.ts',
            ),
            'utf8',
        );

        expect(source).not.toContain('isSentLive');
        expect(source).toContain('hasDrawnLiveTransfer');
    });

    it('lets the payout that concludes the account draw a transfer too', () => {
        const out = simulate({
            fundedHorizonDays: 50,
            liveTransferHazard: 0.5 as Fraction0to1,
            maxEvalDays: 1,
            plan: payoutCapToyPlan(),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 2000,
            winrate: 1,
        });

        expect(out.liveTransferProbability).toBeCloseTo(0.75, 1);
    });
});

describe('the hazard is worded with the digits it was entered with (PT-73b review)', () => {
    it.each([
        [0.3, '30.0%'],
        [0.5, '50.0%'],
        [0.25, '25.0%'],
        [0.1234, '12.34%'],
        [0.0004, '0.04%'],
        [0.00005, '0.005%'],
        [0.9999, '99.99%'],
    ])('words %s as %s', (hazard, text) => {
        expect(liveTransferHazardPercentText(hazard)).toBe(text);
    });

    it('never words a priced hazard as zero', () => {
        for (const hazard of [1e-5, 0.0001, 0.0004, 0.001]) {
            expect(liveTransferHazardPercentText(hazard)).not.toBe('0.0%');
        }
    });
});

describe('the hazard disclosure lines are one source for every surface (PT-73b review)', () => {
    it('names the assumption, the concluding payout, the continuation and the plan note, in that order', () => {
        const lines = liveTransferHazardLines(
            mffuRapidEod,
            0.3 as Fraction0to1,
            SIZED.instrument,
            SIZED.stopPoints,
        );

        expect(lines).toEqual([
            'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
            LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.Modeled
            ],
            LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
            textOf(LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed),
        ]);
    });

    it('keeps the assumption and the concluding payout where the rest of the account is valued at 0', () => {
        const lines = liveTransferHazardLines(
            mffuPro,
            0.3 as Fraction0to1,
            undefined,
            undefined,
        );

        expect(lines).toEqual([
            'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
            LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        ]);
    });

    it('says the payout that concludes the account is also a transfer chance and that this is a modeling choice', () => {
        expect(LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT).toContain('concludes');
        expect(LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT).toContain(
            'modeling choice',
        );
        expect(LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT).not.toContain('\u{2014}');
    });
});

describe('the applicability notes state what this tool models, not firm rules (PT-73b review)', () => {
    it('words the Alpha note as the one modeled live path and the one that is not', () => {
        const text = textOf(LiveApplicabilityNote.AlphaPrimeNotModeled);

        expect(text).toContain('Alpha Futures Live Program');
        expect(text).toContain('Alpha Prime Program');
        expect(text).not.toContain('follows the other');
    });

    it('words the TPT note as the standard PRO+ account modeled and the Development account not', () => {
        const text = textOf(
            LiveApplicabilityNote.TptDevelopmentOnlyOnPlacement,
        );

        expect(text).toContain('PRO+ Development');
        expect(text).not.toContain('only on placement');
    });

    it('words the MFFU note as a contract limit the tool marks disputed, not a firm statement', () => {
        const text = textOf(
            LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed,
        );

        expect(text).toContain('contract limit');
        expect(text).not.toContain('disputed between firm pages');
    });

    it('words no note as a claim about what a firm does', () => {
        for (const note of Object.values(LiveApplicabilityNote)) {
            expect(textOf(note)).toMatch(
                /\bthis tool (?:models|marks|treats|assumes)\b|\brest on\b/i,
            );
        }
    });
});
