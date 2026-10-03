import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    ConductCategory,
    type ConductPattern,
    dollars,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
    differenceReasonText,
    DpNotValidatedCause,
    EngineInputsRefusalKind,
    LiveTriggerScope,
} from '~/lib/prop-calculator/advisor';

const DIFFERENCE_REASON_SOURCE = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
    'DifferenceReason.ts',
);

const FREE_TEXT_FIELDS: readonly string[] = ['gap', 'reason', 'snapshotDate'];

const CONDUCT_PATTERN: ConductPattern = {
    category: ConductCategory.InconsistentSizing,
    consequence: 'inconsistent position sizing review',
    source: {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic verified conduct quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.test/policy',
        verification: PolicyVerification.Confirmed,
    },
};

const DPGAP_FREE_TEXT = 'a free text model gap';
const DPINELIGIBLE_FREE_TEXT = 'a free text ineligibility';

const SENTINELS: Readonly<
    Record<
        DifferenceReason,
        readonly [detail: DifferenceReasonDetail, digits: string]
    >
> = {
    [DifferenceReason.AggressiveOptimumChurn]: [
        {
            kind: DifferenceReason.AggressiveOptimumChurn,
            pattern: CONDUCT_PATTERN,
        },
        '',
    ],
    [DifferenceReason.AssumedInputs]: [
        { kind: DifferenceReason.AssumedInputs },
        '',
    ],
    [DifferenceReason.CandidatesLeftOut]: [
        { kind: DifferenceReason.CandidatesLeftOut, leftOutCount: 4321 },
        '4321',
    ],
    [DifferenceReason.CeilingCap]: [
        { ceiling: dollars(9950.5), kind: DifferenceReason.CeilingCap },
        '995050',
    ],
    [DifferenceReason.ConsistencyCap]: [
        {
            kind: DifferenceReason.ConsistencyCap,
            maxDayProfit: dollars(1234.56),
        },
        '123456',
    ],
    [DifferenceReason.ConsistencyNotEvaluated]: [
        { kind: DifferenceReason.ConsistencyNotEvaluated },
        '',
    ],
    [DifferenceReason.CushionCap]: [
        { cushion: dollars(2345.67), kind: DifferenceReason.CushionCap },
        '234567',
    ],
    [DifferenceReason.DailyLossCap]: [
        {
            dailyLossLimit: dollars(3456.78),
            kind: DifferenceReason.DailyLossCap,
        },
        '345678',
    ],
    [DifferenceReason.DocumentedLadderNeverFunded]: [
        { kind: DifferenceReason.DocumentedLadderNeverFunded, sims: 4321 },
        '4321',
    ],
    [DifferenceReason.DocumentedLadderNotScored]: [
        { kind: DifferenceReason.DocumentedLadderNotScored, sims: 987 },
        '987',
    ],
    [DifferenceReason.DpGridMisaligned]: [
        {
            drawdown: dollars(2000.25),
            kind: DifferenceReason.DpGridMisaligned,
            step: dollars(100.5),
        },
        '20002510050',
    ],
    [DifferenceReason.DpGridSaturation]: [
        { kind: DifferenceReason.DpGridSaturation },
        '',
    ],
    [DifferenceReason.DpIneligible]: [
        {
            kind: DifferenceReason.DpIneligible,
            reason: DPINELIGIBLE_FREE_TEXT,
        },
        '',
    ],
    [DifferenceReason.DpModelGap]: [
        { gap: DPGAP_FREE_TEXT, kind: DifferenceReason.DpModelGap },
        '',
    ],
    [DifferenceReason.DpNotValidated]: [
        {
            cause: DpNotValidatedCause.SolveCapReached,
            kind: DifferenceReason.DpNotValidated,
        },
        '',
    ],
    [DifferenceReason.DpObjectiveMismatch]: [
        { kind: DifferenceReason.DpObjectiveMismatch },
        '',
    ],
    [DifferenceReason.DpPayoutPolicyMismatch]: [
        { kind: DifferenceReason.DpPayoutPolicyMismatch },
        '',
    ],
    [DifferenceReason.DpStateUnreached]: [
        { day: 77, kind: DifferenceReason.DpStateUnreached },
        '77',
    ],
    [DifferenceReason.EngineInputsRefused]: [
        {
            kind: DifferenceReason.EngineInputsRefused,
            refusal: EngineInputsRefusalKind.NoCandidates,
        },
        '',
    ],
    [DifferenceReason.EngineLadderNeverFunded]: [
        { kind: DifferenceReason.EngineLadderNeverFunded, sims: 654 },
        '654',
    ],
    [DifferenceReason.FirmMinimumAboveRequest]: [
        {
            kind: DifferenceReason.FirmMinimumAboveRequest,
            minimum: dollars(500.75),
            requested: dollars(250),
        },
        '2500050075',
    ],
    [DifferenceReason.FlatRiskIgnoresState]: [
        {
            documentedFlatRisk: dollars(250.5),
            fromStateOptimum: dollars(400.25),
            gapInCombinedSEs: 3.7,
            kind: DifferenceReason.FlatRiskIgnoresState,
        },
        '25050400252505037',
    ],
    [DifferenceReason.FreshStartApproximation]: [
        { kind: DifferenceReason.FreshStartApproximation },
        '',
    ],
    [DifferenceReason.HorizonCreditOneRequest]: [
        { horizonDays: 321, kind: DifferenceReason.HorizonCreditOneRequest },
        '321',
    ],
    [DifferenceReason.LiveFloorMinimumTrade]: [
        {
            affordableRisk: dollars(12.34),
            isPlacedAtEnteredStop: true,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: dollars(56.78),
        },
        '56781234',
    ],
    [DifferenceReason.LiveModelApproximation]: [
        { kind: DifferenceReason.LiveModelApproximation },
        '',
    ],
    [DifferenceReason.LiveNotModeled]: [
        { kind: DifferenceReason.LiveNotModeled },
        '',
    ],
    [DifferenceReason.LiveTriggersNotChecked]: [
        { kind: DifferenceReason.LiveTriggersNotChecked },
        '',
    ],
    [DifferenceReason.NoCushion]: [{ kind: DifferenceReason.NoCushion }, ''],
    [DifferenceReason.ObjectiveSpeedVsMonthlyNet]: [
        { kind: DifferenceReason.ObjectiveSpeedVsMonthlyNet },
        '',
    ],
    [DifferenceReason.PayoutPolicyDiffers]: [
        {
            engineRequest: dollars(3000.5),
            headlineRequest: dollars(500),
            kind: DifferenceReason.PayoutPolicyDiffers,
        },
        '50000300050',
    ],
    [DifferenceReason.PersonalCap]: [
        { cap: dollars(120.5), kind: DifferenceReason.PersonalCap },
        '12050',
    ],
    [DifferenceReason.PlanRulesChanged]: [
        { kind: DifferenceReason.PlanRulesChanged },
        '',
    ],
    [DifferenceReason.RemainingTargetCap]: [
        {
            kind: DifferenceReason.RemainingTargetCap,
            remaining: dollars(1500.5),
        },
        '150050',
    ],
    [DifferenceReason.RetainedCushionBasis]: [
        {
            d4Cushion: dollars(2000.25),
            kind: DifferenceReason.RetainedCushionBasis,
            rulebookCushion: dollars(2500.5),
        },
        '2500504200025',
    ],
    [DifferenceReason.StaleAdvice]: [
        { kind: DifferenceReason.StaleAdvice, snapshotDate: '2026-09-21' },
        '20260921',
    ],
    [DifferenceReason.Suspended]: [{ kind: DifferenceReason.Suspended }, ''],
    [DifferenceReason.WholeContractPlacement]: [
        { contracts: 3, kind: DifferenceReason.WholeContractPlacement },
        '3',
    ],
    [DifferenceReason.WithinNoise]: [
        {
            gap: dollars(1234.56),
            kind: DifferenceReason.WithinNoise,
            threshold: dollars(7.25),
        },
        '123456725',
    ],
    [DifferenceReason.WouldTriggerLive]: [
        {
            kind: DifferenceReason.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 3,
            },
        },
        '23',
    ],
};

function digitsOf(text: string): string {
    return (text.match(/\d/g) ?? []).join('');
}

describe('every difference reason builds its text from typed numbers only (PT-104, F-124)', () => {
    it.each(Object.values(DifferenceReason))(
        'the %s text carries exactly its sentinel digits',
        (member) => {
            const [detail, digits] = SENTINELS[member];

            const text = differenceReasonText(detail);

            expect(detail.kind).toBe(member);
            expect(text.length).toBeGreaterThan(0);
            expect(digitsOf(text)).toBe(digits);
        },
    );

    it('prints the two free-text reasons verbatim, the only reasons that keep free text', () => {
        expect(
            differenceReasonText({
                kind: DifferenceReason.DpIneligible,
                reason: DPINELIGIBLE_FREE_TEXT,
            }),
        ).toContain(DPINELIGIBLE_FREE_TEXT);
        expect(
            differenceReasonText({
                gap: DPGAP_FREE_TEXT,
                kind: DifferenceReason.DpModelGap,
            }),
        ).toContain(DPGAP_FREE_TEXT);
    });

    it('declares no free-text field on a reason detail beyond the named exceptions', () => {
        const source = readFileSync(DIFFERENCE_REASON_SOURCE, 'utf8');
        const stringFields = source
            .matchAll(/readonly (\w+): (?:null \| )?string\b/g)
            .map((match) => match[1])
            .toArray();

        expect(
            stringFields.toSorted((a, b) => (a ?? '').localeCompare(b ?? '')),
        ).toStrictEqual(
            FREE_TEXT_FIELDS.toSorted((a, b) => a.localeCompare(b)),
        );
    });

    it('words each engine-inputs refusal differently', () => {
        const texts = Object.values(EngineInputsRefusalKind).map((refusal) =>
            differenceReasonText({
                kind: DifferenceReason.EngineInputsRefused,
                refusal,
            }),
        );

        expect(new Set(texts).size).toBe(texts.length);
    });
});
