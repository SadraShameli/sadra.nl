import {
    AccountStatus,
    AccountTracking,
    BankrollTransferKind,
    FeeKind,
    FirmKeyKind,
    firmKeyLabel,
    isAccountDate,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';
import { type RulebookParameters } from '~/lib/prop-calculator/advisor';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

import {
    isActiveAccount,
    type LedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
} from './PortfolioLedger';

export enum SetupMissingKind {
    Account = 'account',
    Bankroll = 'bankroll',
    Firm = 'firm',
    Plan = 'plan',
}

export enum SetupStep {
    BudgetSet = 'budget-set',
    CostsEntered = 'costs-entered',
    ExpectedValueComputed = 'expected-value-computed',
    FirmRulesVerified = 'firm-rules-verified',
    StagesCaptured = 'stages-captured',
}

export enum SetupStepStatus {
    Done = 'done',
    Missing = 'missing',
    NotApplicable = 'not-applicable',
    NotChecked = 'not-checked',
}

export interface FirmVerificationDate {
    readonly firmId: FirmId;
    readonly verifiedOn: string;
}

export interface SetupChecklist {
    readonly doneCount: number;
    readonly isComplete: boolean;
    readonly steps: readonly SetupStepResult[];
}

export interface SetupChecklistInputs {
    readonly expectedValuePlanSerials: null | ReadonlySet<string>;
    readonly firmVerificationDateOf?: (firmId: FirmId) => null | string;
    readonly ledger: PortfolioLedger;
    readonly rulebook: RulebookParameters;
    readonly staleSnapshotAccountIds: ReadonlySet<string>;
}

export type SetupMissingItem =
    | {
          readonly accountId: string;
          readonly kind: SetupMissingKind.Account;
          readonly label: string;
      }
    | {
          readonly firmId: FirmId;
          readonly kind: SetupMissingKind.Firm;
          readonly label: string;
      }
    | { readonly kind: SetupMissingKind.Bankroll }
    | {
          readonly kind: SetupMissingKind.Plan;
          readonly label: string;
          readonly planSerial: string;
      };

export interface SetupStepResult {
    readonly firmDates: readonly FirmVerificationDate[];
    readonly missing: readonly SetupMissingItem[];
    readonly status: SetupStepStatus;
    readonly step: SetupStep;
}

const NO_FIRM_DATES: readonly FirmVerificationDate[] = [];
const NO_MISSING: readonly SetupMissingItem[] = [];

export function heldPlanGroupsOf(
    ledger: PortfolioLedger,
): readonly PlanGroup[] {
    return ledger
        .planGroups()
        .filter((group) =>
            group.accounts.some(
                (entry) =>
                    entry.row.archivedAt === null &&
                    (entry.row.status === AccountStatus.Active ||
                        entry.row.status === AccountStatus.Suspended),
            ),
        );
}

export function setupChecklistOf(inputs: SetupChecklistInputs): SetupChecklist {
    const steps = [
        budgetStep(inputs),
        firmRulesStep(inputs),
        stagesStep(inputs),
        expectedValueStep(inputs),
        costsStep(inputs),
    ];
    const doneCount = steps.filter(
        (step) => step.status === SetupStepStatus.Done,
    ).length;
    const hasAccountStepDone = steps.some(
        (step) =>
            step.step !== SetupStep.BudgetSet &&
            step.status === SetupStepStatus.Done,
    );
    const isComplete =
        hasAccountStepDone &&
        steps.every(
            (step) =>
                step.status === SetupStepStatus.Done ||
                step.status === SetupStepStatus.NotApplicable,
        );
    return { doneCount, isComplete, steps };
}

function activeAccountsOf(ledger: PortfolioLedger): readonly LedgerAccount[] {
    return ledger.accounts.filter((entry) => isActiveAccount(entry.row));
}

function budgetStep(inputs: SetupChecklistInputs): SetupStepResult {
    const { bankroll } = inputs.rulebook;
    const hasDeposit = inputs.ledger.transfers.some(
        (transfer) => transfer.kind === BankrollTransferKind.Deposit,
    );
    const hasSettings = [
        bankroll.accountsPerSession,
        bankroll.dailyAccountCapacity,
        bankroll.defaultRoundBudgetCents,
        bankroll.lossRiskThreshold,
        bankroll.objectiveSwitchCents,
        bankroll.sessionHoursPerDay,
    ].some((value) => value !== null);
    return hasDeposit || hasSettings
        ? stepResult(SetupStep.BudgetSet, SetupStepStatus.Done)
        : stepResult(SetupStep.BudgetSet, SetupStepStatus.Missing, [
              { kind: SetupMissingKind.Bankroll },
          ]);
}

function costsStep(inputs: SetupChecklistInputs): SetupStepResult {
    const active = activeAccountsOf(inputs.ledger);
    if (active.length === 0) {
        return stepResult(
            SetupStep.CostsEntered,
            SetupStepStatus.NotApplicable,
        );
    }
    const missing = active.flatMap((entry): SetupMissingItem[] =>
        hasPurchaseFee(entry)
            ? []
            : [
                  {
                      accountId: entry.row.id,
                      kind: SetupMissingKind.Account,
                      label: entry.row.label,
                  },
              ],
    );
    return missing.length === 0
        ? stepResult(SetupStep.CostsEntered, SetupStepStatus.Done)
        : stepResult(SetupStep.CostsEntered, SetupStepStatus.Missing, missing);
}

function expectedValueStep(inputs: SetupChecklistInputs): SetupStepResult {
    const held = heldPlanGroupsOf(inputs.ledger);
    if (held.length === 0) {
        return stepResult(
            SetupStep.ExpectedValueComputed,
            SetupStepStatus.NotApplicable,
        );
    }
    const computed = inputs.expectedValuePlanSerials;
    if (computed === null) {
        return stepResult(
            SetupStep.ExpectedValueComputed,
            SetupStepStatus.NotChecked,
        );
    }
    const missing = held
        .filter((group) => !computed.has(group.planSerial))
        .map((group): SetupMissingItem => ({
            kind: SetupMissingKind.Plan,
            label: `${group.firm.displayName} ${group.plan.label}`,
            planSerial: group.planSerial,
        }));
    return missing.length === 0
        ? stepResult(SetupStep.ExpectedValueComputed, SetupStepStatus.Done)
        : stepResult(
              SetupStep.ExpectedValueComputed,
              SetupStepStatus.Missing,
              missing,
          );
}

function firmRulesStep(inputs: SetupChecklistInputs): SetupStepResult {
    const firmIds = [
        ...new Set(
            heldPlanGroupsOf(inputs.ledger).map((group) => group.firmId),
        ),
    ];
    if (firmIds.length === 0) {
        return stepResult(
            SetupStep.FirmRulesVerified,
            SetupStepStatus.NotApplicable,
        );
    }
    const dateOf =
        inputs.firmVerificationDateOf ??
        ((firmId: FirmId): string => firmDataProvenance(firmId).verifiedOn);
    const dates: FirmVerificationDate[] = [];
    const missing: SetupMissingItem[] = [];
    for (const firmId of firmIds) {
        const verifiedOn = dateOf(firmId);
        if (verifiedOn !== null && isAccountDate(verifiedOn)) {
            dates.push({ firmId, verifiedOn });
        } else {
            missing.push({
                firmId,
                kind: SetupMissingKind.Firm,
                label: firmKeyLabel({ firmId, kind: FirmKeyKind.Modeled }, []),
            });
        }
    }
    return {
        firmDates: dates,
        missing,
        status:
            missing.length === 0
                ? SetupStepStatus.Done
                : SetupStepStatus.Missing,
        step: SetupStep.FirmRulesVerified,
    };
}

function hasPurchaseFee(entry: LedgerAccount): boolean {
    const wanted =
        entry.plan === null
            ? [FeeKind.Activation, FeeKind.EvalPurchase]
            : [
                  entry.plan.plan.isInstantFunded
                      ? FeeKind.Activation
                      : FeeKind.EvalPurchase,
              ];
    return entry.fees.some((fee) => wanted.includes(fee.kind));
}

function stagesStep(inputs: SetupChecklistInputs): SetupStepResult {
    const active = activeAccountsOf(inputs.ledger).filter(
        (entry) => entry.row.tracking === AccountTracking.Modeled,
    );
    if (active.length === 0) {
        return stepResult(
            SetupStep.StagesCaptured,
            SetupStepStatus.NotApplicable,
        );
    }
    const missing = active
        .filter((entry) => inputs.staleSnapshotAccountIds.has(entry.row.id))
        .map((entry): SetupMissingItem => ({
            accountId: entry.row.id,
            kind: SetupMissingKind.Account,
            label: entry.row.label,
        }));
    return missing.length === 0
        ? stepResult(SetupStep.StagesCaptured, SetupStepStatus.Done)
        : stepResult(
              SetupStep.StagesCaptured,
              SetupStepStatus.Missing,
              missing,
          );
}

function stepResult(
    step: SetupStep,
    status: SetupStepStatus,
    missing: readonly SetupMissingItem[] = NO_MISSING,
): SetupStepResult {
    return { firmDates: NO_FIRM_DATES, missing, status, step };
}
