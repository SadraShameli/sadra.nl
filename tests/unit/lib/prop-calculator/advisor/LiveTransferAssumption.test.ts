import { describe, expect, it } from 'vitest';

import {
    findFirm,
    FirmId,
    type Fraction0to1,
    FundedNextVariant,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    assumptionSchema,
    assumptionText,
    liveTransferAssumptionOf,
} from '~/lib/prop-calculator/advisor';
import { LiveApplicabilityNote } from '~/lib/prop-calculator/firms';
import {
    LIVE_TRANSFER_NOTE_TEXT,
    LiveTransferContinuationKind,
    liveTransferHazardLines,
} from '~/lib/prop-calculator/simulator';

function planOf(firm: FirmId, variant: FundedNextVariant | MffuVariant): Plan {
    const plan = findFirm(firm)?.plans.find(
        (candidate) =>
            'variant' in candidate.id && candidate.id.variant === variant,
    );
    if (!plan) throw new Error(`${firm} ${variant} plan not found`);
    return plan;
}

const mffuRapidEod = planOf(FirmId.Mffu, MffuVariant.RapidEod);
const flex = planOf(FirmId.FundedNext, FundedNextVariant.Flex);
const HAZARD = 0.3 as Fraction0to1;

function inputsOf(
    plan: Plan,
    liveTransferHazard: Fraction0to1 | undefined,
    isSized = true,
) {
    return {
        instrument: isSized ? InstrumentSymbol.MNQ : undefined,
        liveTransferHazard,
        plan,
        stopPoints: isSized ? 10 : undefined,
    };
}

describe('the live-transfer hazard is a typed assumption (PT-73d step 1)', () => {
    it('is absent when the run priced no hazard', () => {
        expect(
            liveTransferAssumptionOf(inputsOf(mffuRapidEod, undefined), null),
        ).toBeUndefined();
        expect(
            liveTransferAssumptionOf(
                inputsOf(mffuRapidEod, 0 as Fraction0to1),
                null,
            ),
        ).toBeUndefined();
    });

    it('carries the hazard, the share sent live, the continuation kind and its notes', () => {
        const assumption = liveTransferAssumptionOf(
            inputsOf(mffuRapidEod, HAZARD),
            0.413,
        );

        expect(assumption).toMatchObject({
            bias: AssumptionBias.Neutral,
            continuation: LiveTransferContinuationKind.Modeled,
            hazard: 0.3,
            kind: AssumptionKind.LiveTransferHazard,
            sentLiveShare: 0.413,
        });
        expect(assumption?.notes).toContain(
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed
            ],
        );
    });

    it('reads as the one hazard wording, joined into a sentence run', () => {
        const assumption = liveTransferAssumptionOf(
            inputsOf(mffuRapidEod, HAZARD),
            0.413,
        );
        if (assumption === undefined) throw new Error('expected an assumption');

        expect(assumptionText(assumption)).toBe(
            liveTransferHazardLines(
                mffuRapidEod,
                HAZARD,
                InstrumentSymbol.MNQ,
                10,
                0.413,
            ).join(' '),
        );
    });

    it('keeps the plan note beside the $0 continuation of a plan whose live builder is unverified', () => {
        const assumption = liveTransferAssumptionOf(
            inputsOf(flex, HAZARD),
            null,
        );

        expect(assumption?.continuation).toBe(
            LiveTransferContinuationKind.NotModeled,
        );
        expect(assumption?.notes).toEqual([
            LIVE_TRANSFER_NOTE_TEXT[
                LiveApplicabilityNote.FundedNextFlexTriggerConflict
            ],
        ]);
    });

    it('says the rest of the account is valued at $0 without an instrument and stop', () => {
        const assumption = liveTransferAssumptionOf(
            inputsOf(mffuRapidEod, HAZARD, false),
            null,
        );

        expect(assumption?.continuation).toBe(
            LiveTransferContinuationKind.NotModeled,
        );
        expect(assumption?.notes).toEqual([]);
    });

    it('validates at a boundary and survives structuredClone', () => {
        const assumption = liveTransferAssumptionOf(
            inputsOf(mffuRapidEod, HAZARD),
            0.413,
        );
        const cloned: unknown = structuredClone(assumption);

        expect(assumptionSchema.parse(cloned)).toStrictEqual(assumption);
    });

    it.each([
        ['a hazard above one', { hazard: 1.2 }],
        ['a zero hazard', { hazard: 0 }],
        ['a share above one', { sentLiveShare: 1.2 }],
        ['an unknown continuation', { continuation: 'unknown' }],
        [
            'a continuation that prints nothing',
            { continuation: LiveTransferContinuationKind.Off },
        ],
    ])('rejects %s', (_name, override) => {
        const assumption = liveTransferAssumptionOf(
            inputsOf(mffuRapidEod, HAZARD),
            0.4,
        );

        expect(
            assumptionSchema.safeParse({ ...assumption, ...override }).success,
        ).toBe(false);
    });
});
