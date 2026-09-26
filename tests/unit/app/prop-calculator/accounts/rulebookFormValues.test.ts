import { type FieldPathValue } from 'react-hook-form';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    FieldKind,
    formPathOf,
    hazardFieldName,
    type HazardFieldName,
    hazardFieldSpec,
    readRulebookDraft,
    rulebookFormSchema,
    type RulebookFormValues,
    rulebookToFormValues,
    TEXT_FIELDS,
    type TextFieldName,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFormValues';
import { FirmId } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    RiskDisplayUnit,
    type RulebookParameters,
    rulebookSchema,
} from '~/lib/prop-calculator/advisor';

const EM_DASH = String.fromCodePoint(0x20_14);
const VIDEO_AUTHOR_LABEL = "the video author's choice, not a default";

const OPTIONAL_FIELDS: readonly TextFieldName[] = [
    'alerts.dayLossBankrollFraction',
    'alerts.firmProfitConcentrationCount',
    'alerts.firmProfitConcentrationShare',
    'alerts.payoutReadyLossFraction',
    'alerts.payoutReadyRiskAboveRungCents',
    'bankroll.accountsPerSession',
    'bankroll.dailyAccountCapacity',
    'bankroll.defaultRoundBudgetCents',
    'bankroll.lossRiskThreshold',
    'bankroll.objectiveSwitchCents',
    'bankroll.sessionHoursPerDay',
    'review.monthlyPayoutTargetCents',
    'review.targetMonthlyMultiple',
    'samples.minClosedRounds',
    'samples.minEvalAttempts',
    'samples.minFundedAccounts',
    'samples.minTrades',
];

function everyV2FieldSet(): RulebookParameters {
    return {
        ...structuredClone(DEFAULT_RULEBOOK),
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            dayLossBankrollFraction: 0.1,
            firmProfitConcentrationCount: 3,
            firmProfitConcentrationShare: 0.6,
            payoutReadyLossFraction: 0.5,
            payoutReadyRiskAboveRungCents: 2550,
        },
        bankroll: {
            accountsPerSession: 5,
            dailyAccountCapacity: 12,
            defaultRoundBudgetCents: 200_000,
            lossRiskThreshold: 0.005,
            objectiveSwitchCents: 500_050,
            roundGapDays: 7,
            sessionHoursPerDay: 2.5,
        },
        display: { riskUnit: RiskDisplayUnit.FeeEquivalent },
        liveTransfer: {
            hazardPerPaidPayoutByFirm: {
                [FirmId.Mffu]: 0.1,
                [FirmId.TopStep]: 0.025,
            },
        },
        plausibility: {
            strongMaxExpectancyR: 0.4,
            typicalMaxExpectancyR: 0.25,
        },
        review: {
            ...DEFAULT_RULEBOOK.review,
            monthlyPayoutTargetCents: 1_000_000,
            targetMonthlyMultiple: 1.5,
        },
        samples: {
            minClosedRounds: 3,
            minEvalAttempts: 50,
            minFundedAccounts: 40,
            minTrades: 200,
        },
    };
}

function issueMessages(values: unknown): Record<string, string> {
    const parsed = rulebookFormSchema.safeParse(values);
    return parsed.success
        ? {}
        : Object.fromEntries(
              parsed.error.issues.map((issue) => [
                  issue.path.join('.'),
                  issue.message,
              ]),
          );
}

function issuePaths(values: unknown): string[] {
    const parsed = rulebookFormSchema.safeParse(values);
    return parsed.success
        ? []
        : parsed.error.issues.map((issue) => issue.path.join('.'));
}

function withHazard(
    values: RulebookFormValues,
    firmId: FirmId,
    text: string,
): RulebookFormValues {
    return {
        ...values,
        liveTransfer: {
            hazardPerPaidPayoutByFirm: {
                ...values.liveTransfer.hazardPerPaidPayoutByFirm,
                [firmId]: text,
            },
        },
    };
}

function withText(
    values: RulebookFormValues,
    name: TextFieldName,
    text: string,
): RulebookFormValues {
    const [section, key] = name.split('.', 2);
    if (section === undefined || key === undefined) throw new Error(name);
    const draft = structuredClone(values) as unknown as Record<
        string,
        Record<string, unknown>
    >;
    const sectionValues = draft[section];
    if (sectionValues === undefined) throw new Error(section);
    sectionValues[key] = text;
    return draft as unknown as RulebookFormValues;
}

describe('rulebook form values for the v2 sections', () => {
    it('shows every unset threshold as an empty field and the set defaults as text', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        for (const name of OPTIONAL_FIELDS) {
            expect(TEXT_FIELDS[name].read(values)).toBe('');
        }
        expect(values.bankroll.roundGapDays).toBe('14');
        expect(values.plausibility).toEqual({
            strongMaxExpectancyR: '0.35',
            typicalMaxExpectancyR: '0.3',
        });
        expect(values.display.riskUnit).toBe(RiskDisplayUnit.AccountDollars);
        for (const firmId of Object.values(FirmId)) {
            expect(hazardFieldSpec(firmId).read(values)).toBe('');
        }
    });

    it('reads the empty defaults back as null', () => {
        expect(
            rulebookFormSchema.parse(rulebookToFormValues(DEFAULT_RULEBOOK)),
        ).toEqual(DEFAULT_RULEBOOK);
    });

    it('round-trips a rulebook with every v2 field set', () => {
        const custom = everyV2FieldSet();
        expect(rulebookSchema.parse(custom)).toEqual(custom);
        const values = rulebookToFormValues(custom);
        expect(values.bankroll.lossRiskThreshold).toBe('0.5');
        expect(values.bankroll.objectiveSwitchCents).toBe('5000.50');
        expect(values.liveTransfer.hazardPerPaidPayoutByFirm).toMatchObject({
            [FirmId.Mffu]: '10',
            [FirmId.TopStep]: '2.5',
        });
        expect(hazardFieldSpec(FirmId.Apex).read(values)).toBe('');
        expect(rulebookFormSchema.parse(values)).toEqual(custom);
    });

    it('treats a cleared or blank optional field as not set', () => {
        const values = rulebookToFormValues(everyV2FieldSet());
        const cleared = withText(
            withText(values, 'bankroll.lossRiskThreshold', ''),
            'samples.minEvalAttempts',
            ' '.repeat(3),
        );
        const parsed = rulebookFormSchema.parse(cleared);
        expect(parsed.bankroll.lossRiskThreshold).toBeNull();
        expect(parsed.samples.minEvalAttempts).toBeNull();
        const noHazard = rulebookFormSchema.parse({
            ...values,
            liveTransfer: {
                hazardPerPaidPayoutByFirm: {
                    ...values.liveTransfer.hazardPerPaidPayoutByFirm,
                    [FirmId.Mffu]: '',
                },
            },
        });
        expect(noHazard.liveTransfer.hazardPerPaidPayoutByFirm).toEqual({
            [FirmId.TopStep]: 0.025,
        });
    });

    it('requires the round gap and both plausibility thresholds', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            issuePaths(withText(values, 'bankroll.roundGapDays', '')),
        ).toEqual(['bankroll.roundGapDays']);
        expect(
            issuePaths(
                withText(values, 'plausibility.typicalMaxExpectancyR', ''),
            ),
        ).toEqual(['plausibility.typicalMaxExpectancyR']);
    });

    it('reports unreadable or out-of-bounds v2 text on the field it came from', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            issuePaths(withText(values, 'bankroll.lossRiskThreshold', 'abc')),
        ).toEqual(['bankroll.lossRiskThreshold']);
        expect(
            issuePaths(withText(values, 'bankroll.lossRiskThreshold', '60')),
        ).toEqual(['bankroll.lossRiskThreshold']);
        expect(
            issuePaths(withText(values, 'samples.minTrades', '1.5')),
        ).toEqual(['samples.minTrades']);
        expect(
            issuePaths(
                withText(values, 'plausibility.typicalMaxExpectancyR', '0.5'),
            ),
        ).toEqual(['plausibility.typicalMaxExpectancyR']);
        expect(issuePaths(withHazard(values, FirmId.Mffu, '100'))).toEqual([
            hazardFieldName(FirmId.Mffu),
        ]);
        expect(issuePaths(withHazard(values, FirmId.Mffu, 'often'))).toEqual([
            hazardFieldName(FirmId.Mffu),
        ]);
    });

    it('states a percent field bound in the percent the user typed', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(issueMessages(withHazard(values, FirmId.Mffu, '100'))).toEqual({
            [hazardFieldName(FirmId.Mffu)]: 'Enter a percentage below 100%',
        });
        expect(issueMessages(withHazard(values, FirmId.Mffu, '0'))).toEqual({
            [hazardFieldName(FirmId.Mffu)]: 'Enter a percentage above 0%',
        });
        expect(
            issueMessages(withText(values, 'bankroll.lossRiskThreshold', '60')),
        ).toEqual({
            'bankroll.lossRiskThreshold': 'Enter a percentage of at most 50%',
        });
        expect(
            issueMessages(
                withText(values, 'alerts.firmProfitConcentrationShare', '150'),
            ),
        ).toEqual({
            'alerts.firmProfitConcentrationShare':
                'Enter a percentage of at most 100%',
        });
        expect(
            issueMessages(withText(values, 'samples.minTrades', '20000'))[
                'samples.minTrades'
            ],
        ).not.toContain('%');
    });

    it('holds a text field for every firm hazard, so a form value that leaves one out is rejected', () => {
        expectTypeOf<
            FieldPathValue<RulebookFormValues, HazardFieldName>
        >().toEqualTypeOf<string>();
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(
            Object.keys(values.liveTransfer.hazardPerPaidPayoutByFirm),
        ).toEqual(Object.values(FirmId));
        expect(
            issuePaths({
                ...values,
                liveTransfer: { hazardPerPaidPayoutByFirm: {} },
            }).toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(
            Object.values(FirmId)
                .map((firmId) => hazardFieldName(firmId))
                .toSorted((a, b) => a.localeCompare(b)),
        );
    });

    it('reads a draft with one issue per unreadable v2 field', () => {
        const values = rulebookToFormValues(DEFAULT_RULEBOOK);
        const broken = readRulebookDraft(
            withText(values, 'alerts.dayLossBankrollFraction', 'x'),
        );
        expect(broken.issues.map((issue) => issue.path)).toEqual([
            ['alerts', 'dayLossBankrollFraction'],
        ]);
    });

    it('maps v2 schema issue paths onto their form fields', () => {
        expect(formPathOf(['bankroll', 'lossRiskThreshold'])).toEqual([
            'bankroll',
            'lossRiskThreshold',
        ]);
        expect(formPathOf(['display', 'riskUnit'])).toEqual([
            'display',
            'riskUnit',
        ]);
        expect(
            formPathOf(['liveTransfer', 'hazardPerPaidPayoutByFirm', 'mffu']),
        ).toEqual(['liveTransfer', 'hazardPerPaidPayoutByFirm', 'mffu']);
    });

    it('marks the unset thresholds optional, not skill rules, with the units the schema stores', () => {
        for (const name of OPTIONAL_FIELDS) {
            expect(TEXT_FIELDS[name]).toMatchObject({
                isOptional: true,
                source: null,
            });
        }
        expect(TEXT_FIELDS['bankroll.roundGapDays'].isOptional).toBe(false);
        expect(TEXT_FIELDS['funded.riskCents'].isOptional).toBe(false);
        expect(TEXT_FIELDS['bankroll.lossRiskThreshold'].kind).toBe(
            FieldKind.Percent,
        );
        expect(TEXT_FIELDS['bankroll.objectiveSwitchCents'].kind).toBe(
            FieldKind.Money,
        );
        expect(TEXT_FIELDS['samples.minEvalAttempts'].kind).toBe(
            FieldKind.Count,
        );
        expect(hazardFieldSpec(FirmId.Mffu)).toMatchObject({
            isOptional: true,
            kind: FieldKind.Percent,
            label: 'My Funded Futures',
            source: null,
        });
    });

    it("offers the video author's loss-risk and sample values only as labelled help text", () => {
        expect(TEXT_FIELDS['bankroll.lossRiskThreshold'].hint).toContain(
            `0.5% (${VIDEO_AUTHOR_LABEL})`,
        );
        expect(TEXT_FIELDS['samples.minEvalAttempts'].hint).toContain(
            `50 (${VIDEO_AUTHOR_LABEL})`,
        );
        expect(TEXT_FIELDS['samples.minFundedAccounts'].hint).toContain(
            `50 (${VIDEO_AUTHOR_LABEL})`,
        );
        const defaults = rulebookToFormValues(DEFAULT_RULEBOOK);
        expect(TEXT_FIELDS['bankroll.lossRiskThreshold'].read(defaults)).toBe(
            '',
        );
        expect(TEXT_FIELDS['samples.minEvalAttempts'].read(defaults)).toBe('');
    });

    it('writes no em dash in any field label or hint', () => {
        const specs = [
            ...Object.values(TEXT_FIELDS),
            ...Object.values(FirmId).map((firmId) => hazardFieldSpec(firmId)),
        ];
        for (const spec of specs) {
            expect(spec.label).not.toContain(EM_DASH);
            expect(spec.hint).not.toContain(EM_DASH);
        }
    });
});
