import { describe, expect, it } from 'vitest';

import * as root from '~/lib/prop-accounts';
import * as core from '~/lib/prop-accounts/core';
import {
    BankrollTransferKind,
    bankrollTransferKindLabel,
    BustCause,
    bustCauseLabel,
    FirmEngagementReason,
    firmEngagementReasonLabel,
    FirmEngagementStatus,
    firmEngagementStatusLabel,
    ReportedPayoutBasis,
    reportedPayoutBasisLabel,
    RoundStatus,
    roundStatusLabel,
    RuleViolationKind,
    ruleViolationKindLabel,
    ViolationSource,
    violationSourceLabel,
} from '~/lib/prop-accounts/core';

const STORED_ENUM_LENGTH = 32;
const KEBAB_CASE = /^[a-z]+(?:-[a-z]+)*$/;
const EM_DASH = '\u{2014}';

interface EnumCase {
    readonly enumName: string;
    readonly label: (value: never) => string;
    readonly labelName: string;
    readonly members: readonly string[];
    readonly values: Readonly<Record<string, string>>;
}

const CASES: readonly EnumCase[] = [
    {
        enumName: 'BankrollTransferKind',
        label: bankrollTransferKindLabel,
        labelName: 'bankrollTransferKindLabel',
        members: ['Deposit', 'Withdrawal'],
        values: BankrollTransferKind,
    },
    {
        enumName: 'RoundStatus',
        label: roundStatusLabel,
        labelName: 'roundStatusLabel',
        members: ['Closed', 'Open'],
        values: RoundStatus,
    },
    {
        enumName: 'FirmEngagementStatus',
        label: firmEngagementStatusLabel,
        labelName: 'firmEngagementStatusLabel',
        members: ['Active', 'Paused', 'Retired'],
        values: FirmEngagementStatus,
    },
    {
        enumName: 'FirmEngagementReason',
        label: firmEngagementReasonLabel,
        labelName: 'firmEngagementReasonLabel',
        members: [
            'Capacity',
            'LiveCooldown',
            'LowExpectedValue',
            'Other',
            'PayoutIssue',
            'RulesChanged',
            'SentLive',
        ],
        values: FirmEngagementReason,
    },
    {
        enumName: 'ReportedPayoutBasis',
        label: reportedPayoutBasisLabel,
        labelName: 'reportedPayoutBasisLabel',
        members: ['Gross', 'Net'],
        values: ReportedPayoutBasis,
    },
    {
        enumName: 'RuleViolationKind',
        label: ruleViolationKindLabel,
        labelName: 'ruleViolationKindLabel',
        members: [
            'BrokeDailyStop',
            'ChasedLoss',
            'ForcedRecovery',
            'IgnoredStop',
            'Other',
            'Oversize',
            'TiltAfterMisSize',
            'TradedWhenPayoutReady',
            'WrongInstrument',
        ],
        values: RuleViolationKind,
    },
    {
        enumName: 'ViolationSource',
        label: violationSourceLabel,
        labelName: 'violationSourceLabel',
        members: ['Detected', 'Manual'],
        values: ViolationSource,
    },
    {
        enumName: 'BustCause',
        label: bustCauseLabel,
        labelName: 'bustCauseLabel',
        members: [
            'ConsistencyBreach',
            'DailyLossLimit',
            'FirmRuleViolation',
            'Inactivity',
            'MaxDrawdown',
            'Unknown',
        ],
        values: BustCause,
    },
];

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function labelsOf({ label, values }: EnumCase): string[] {
    return Object.values(values).map((value) => label(value as never));
}

describe('the video record enums', () => {
    it.each(CASES)(
        '$enumName declares every member up front',
        ({ members, values }) => {
            expect(Object.keys(values).toSorted(byName)).toEqual(
                [...members].toSorted(byName),
            );
        },
    );

    it.each(CASES)(
        '$enumName stores kebab-case values that fit the 32-character enum column',
        ({ values }) => {
            for (const value of Object.values(values)) {
                expect(value, value).toMatch(KEBAB_CASE);
                expect(value.length, value).toBeLessThanOrEqual(
                    STORED_ENUM_LENGTH,
                );
            }
        },
    );

    it.each(CASES)(
        '$enumName gives every member a distinct, non-empty label without an em dash',
        (entry) => {
            const labels = labelsOf(entry);
            expect(labels).toHaveLength(Object.keys(entry.values).length);
            expect(new Set(labels).size).toBe(labels.length);
            for (const label of labels) {
                expect(label.trim().length, label).toBeGreaterThan(0);
                expect(label, label).not.toContain(EM_DASH);
                expect(label.charAt(0), label).toBe(
                    label.charAt(0).toUpperCase(),
                );
            }
        },
    );

    it.each(CASES)(
        '$enumName and its label are exported through both barrels, with the label map kept private',
        ({ enumName, labelName }) => {
            const coreExports = core as Record<string, unknown>;
            const rootExports = root as Record<string, unknown>;
            expect(coreExports[enumName]).toBeDefined();
            expect(rootExports[enumName]).toBe(coreExports[enumName]);
            expect(typeof coreExports[labelName]).toBe('function');
            expect(rootExports[labelName]).toBe(coreExports[labelName]);
            const privateMap = `${enumName.replaceAll(/(?<!^)([A-Z])/g, '_$1').toUpperCase()}_LABEL`;
            expect(Object.keys(core)).not.toContain(privateMap);
            expect(Object.keys(root)).not.toContain(privateMap);
        },
    );
});

describe('rule violation labels', () => {
    it('reads ForcedRecovery as risk above the documented rung, so the documented ladder step after a loss is never one', () => {
        expect(ruleViolationKindLabel(RuleViolationKind.ForcedRecovery)).toBe(
            'Risk above the documented rung to recover a loss',
        );
    });

    it('reads TradedWhenPayoutReady as risk above the documented rung while payout-eligible', () => {
        expect(
            ruleViolationKindLabel(RuleViolationKind.TradedWhenPayoutReady),
        ).toBe('Risk above the documented rung while payout-eligible');
    });

    it('reads BrokeDailyStop as trading after the documented day stop fired', () => {
        expect(ruleViolationKindLabel(RuleViolationKind.BrokeDailyStop)).toBe(
            'Traded after the documented day stop fired',
        );
    });
});

describe('the other pinned labels', () => {
    it('names a personal withdrawal apart from a firm payout', () => {
        expect(bankrollTransferKindLabel(BankrollTransferKind.Withdrawal)).toBe(
            'Personal withdrawal',
        );
        expect(bankrollTransferKindLabel(BankrollTransferKind.Deposit)).toBe(
            'Deposit',
        );
    });

    it('names the basis a firm dashboard total is reported on', () => {
        expect(reportedPayoutBasisLabel(ReportedPayoutBasis.Gross)).toBe(
            'Gross, before the profit split',
        );
        expect(reportedPayoutBasisLabel(ReportedPayoutBasis.Net)).toBe(
            'Net, what you received',
        );
    });

    it('names the retired-after-sent-live reason the roster uses', () => {
        expect(firmEngagementStatusLabel(FirmEngagementStatus.Retired)).toBe(
            'Retired',
        );
        expect(firmEngagementReasonLabel(FirmEngagementReason.SentLive)).toBe(
            'Sent live',
        );
    });

    it('labels a bust by its cause and an unknown cause as unknown', () => {
        expect(bustCauseLabel(BustCause.MaxDrawdown)).toBe('Maximum drawdown');
        expect(bustCauseLabel(BustCause.DailyLossLimit)).toBe(
            'Daily loss limit',
        );
        expect(bustCauseLabel(BustCause.Unknown)).toBe('Unknown');
    });

    it('labels round status and violation source', () => {
        expect(roundStatusLabel(RoundStatus.Open)).toBe('Open');
        expect(roundStatusLabel(RoundStatus.Closed)).toBe('Closed');
        expect(violationSourceLabel(ViolationSource.Manual)).toBe(
            'Logged by you',
        );
        expect(violationSourceLabel(ViolationSource.Detected)).toBe(
            'Detected from your journal',
        );
    });
});
