import { describe, expect, it } from 'vitest';

import {
    AccountStatus,
    AccountTracking,
    BankrollTransferKind,
    FeeKind,
} from '~/lib/prop-accounts/core';
import {
    heldPlanGroupsOf,
    type SetupChecklistInputs,
    setupChecklistOf,
    SetupMissingKind,
    SetupStep,
    type SetupStepResult,
    SetupStepStatus,
} from '~/lib/prop-accounts/metrics';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

import {
    account,
    EVAL_PLAN,
    fee,
    INSTANT_PLAN,
    ledger,
    transfer,
} from './ledgerFixtures';

type Overrides = Partial<SetupChecklistInputs> & {
    readonly ledger: SetupChecklistInputs['ledger'];
};

const NO_STALE: ReadonlySet<string> = new Set();

function checklistOf(overrides: Overrides) {
    return setupChecklistOf({
        expectedValuePlanSerials: new Set(),
        rulebook: DEFAULT_RULEBOOK,
        staleSnapshotAccountIds: NO_STALE,
        ...overrides,
    });
}

function deposit() {
    return transfer(BankrollTransferKind.Deposit, 500_000, '2026-09-01');
}

function purchaseFee(owner: ReturnType<typeof account>, kind: FeeKind) {
    return fee(owner, kind, 15_000, '2026-09-01');
}

function stepFor(step: SetupStep, overrides: Overrides): SetupStepResult {
    const found = checklistOf(overrides).steps.find(
        (candidate) => candidate.step === step,
    );
    if (found === undefined) throw new Error(`missing step ${step}`);
    return found;
}

describe('setupChecklistOf', () => {
    it('lists the five steps in order', () => {
        const result = checklistOf({ ledger: ledger({}) });
        expect(result.steps.map((step) => step.step)).toEqual([
            SetupStep.BudgetSet,
            SetupStep.FirmRulesVerified,
            SetupStep.StagesCaptured,
            SetupStep.ExpectedValueComputed,
            SetupStep.CostsEntered,
        ]);
    });

    describe('BudgetSet', () => {
        it('is missing with no deposit and no bankroll settings', () => {
            const step = stepFor(SetupStep.BudgetSet, { ledger: ledger({}) });
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([{ kind: SetupMissingKind.Bankroll }]);
        });

        it('is done once a deposit exists', () => {
            const book = ledger({ transfers: [deposit()] });
            const step = stepFor(SetupStep.BudgetSet, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.Done);
            expect(step.missing).toEqual([]);
        });

        it('does not count a personal withdrawal as a budget', () => {
            const withdrawal = transfer(
                BankrollTransferKind.Withdrawal,
                100_000,
                '2026-09-01',
            );
            const book = ledger({ transfers: [withdrawal] });
            const step = stepFor(SetupStep.BudgetSet, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.Missing);
        });

        it('is done once a bankroll setting is set, without any deposit', () => {
            const rulebook = {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    defaultRoundBudgetCents: 300_000,
                },
            };
            const step = stepFor(SetupStep.BudgetSet, {
                ledger: ledger({}),
                rulebook,
            });
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('does not treat the round gap default as a budget setting', () => {
            expect(DEFAULT_RULEBOOK.bankroll.roundGapDays).not.toBeNull();
            const step = stepFor(SetupStep.BudgetSet, { ledger: ledger({}) });
            expect(step.status).toBe(SetupStepStatus.Missing);
        });
    });

    describe('with no active account', () => {
        it('marks the account-dependent steps not applicable instead of done', () => {
            const result = checklistOf({ ledger: ledger({}) });
            const statuses = result.steps
                .filter((step) => step.step !== SetupStep.BudgetSet)
                .map((step) => step.status);
            expect(statuses).toEqual([
                SetupStepStatus.NotApplicable,
                SetupStepStatus.NotApplicable,
                SetupStepStatus.NotApplicable,
                SetupStepStatus.NotApplicable,
            ]);
            expect(result.isComplete).toBe(false);
        });

        it('treats archived and ended accounts as not held', () => {
            const ended = account(EVAL_PLAN, { status: AccountStatus.Busted });
            const archived = account(EVAL_PLAN, { archivedAt: new Date() });
            const book = ledger({ accounts: [ended, archived] });
            const step = stepFor(SetupStep.FirmRulesVerified, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.NotApplicable);
        });
    });

    describe('FirmRulesVerified', () => {
        it('is done and shows the verification date of every held firm', () => {
            const book = ledger({ accounts: [account(EVAL_PLAN)] });
            const step = stepFor(SetupStep.FirmRulesVerified, { ledger: book });
            const provenance = firmDataProvenance(EVAL_PLAN.firm.id);
            expect(step.status).toBe(SetupStepStatus.Done);
            expect(step.firmDates).toEqual([
                {
                    firmId: EVAL_PLAN.firm.id,
                    verifiedOn: provenance.verifiedOn,
                },
            ]);
        });

        it('is missing for a held firm that has no verification date', () => {
            const book = ledger({ accounts: [account(EVAL_PLAN)] });
            const step = stepFor(SetupStep.FirmRulesVerified, {
                firmVerificationDateOf: () => null,
                ledger: book,
            });
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([
                {
                    firmId: EVAL_PLAN.firm.id,
                    kind: SetupMissingKind.Firm,
                    label: expect.any(String) as string,
                },
            ]);
        });

        it('rejects a verification date that is not a real calendar date', () => {
            const book = ledger({ accounts: [account(EVAL_PLAN)] });
            const step = stepFor(SetupStep.FirmRulesVerified, {
                firmVerificationDateOf: () => '2026-02-31',
                ledger: book,
            });
            expect(step.status).toBe(SetupStepStatus.Missing);
        });

        it('lists each held firm once even with several plans', () => {
            const book = ledger({
                accounts: [account(EVAL_PLAN), account(EVAL_PLAN)],
            });
            const step = stepFor(SetupStep.FirmRulesVerified, { ledger: book });
            expect(step.firmDates).toHaveLength(1);
        });
    });

    describe('StagesCaptured', () => {
        it('is done when no active modeled account is flagged stale', () => {
            const book = ledger({ accounts: [account(EVAL_PLAN)] });
            const step = stepFor(SetupStep.StagesCaptured, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('lists each active account the stale snapshot rule flags', () => {
            const stale = account(EVAL_PLAN, { label: 'Stale one' });
            const fresh = account(EVAL_PLAN, { label: 'Fresh one' });
            const step = stepFor(SetupStep.StagesCaptured, {
                ledger: ledger({ accounts: [stale, fresh] }),
                staleSnapshotAccountIds: new Set([stale.id]),
            });
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([
                {
                    accountId: stale.id,
                    kind: SetupMissingKind.Account,
                    label: 'Stale one',
                },
            ]);
        });

        it('ignores a flagged id that is not an active modeled account', () => {
            const ended = account(EVAL_PLAN, { status: AccountStatus.Closed });
            const held = account(EVAL_PLAN);
            const step = stepFor(SetupStep.StagesCaptured, {
                ledger: ledger({ accounts: [ended, held] }),
                staleSnapshotAccountIds: new Set([ended.id]),
            });
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('does not ask a ledger-only account for a snapshot', () => {
            const ledgerOnly = account(EVAL_PLAN, {
                planLabel: 'Hola 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            });
            const step = stepFor(SetupStep.StagesCaptured, {
                ledger: ledger({ accounts: [ledgerOnly] }),
                staleSnapshotAccountIds: new Set([ledgerOnly.id]),
            });
            expect(step.status).toBe(SetupStepStatus.NotApplicable);
        });
    });

    describe('ExpectedValueComputed', () => {
        it('is not checked while the engine has not answered', () => {
            const step = stepFor(SetupStep.ExpectedValueComputed, {
                expectedValuePlanSerials: null,
                ledger: ledger({ accounts: [account(EVAL_PLAN)] }),
            });
            expect(step.status).toBe(SetupStepStatus.NotChecked);
        });

        it('is missing for a held plan with no result', () => {
            const step = stepFor(SetupStep.ExpectedValueComputed, {
                expectedValuePlanSerials: new Set(),
                ledger: ledger({ accounts: [account(EVAL_PLAN)] }),
            });
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([
                {
                    kind: SetupMissingKind.Plan,
                    label: expect.any(String) as string,
                    planSerial: EVAL_PLAN.serial,
                },
            ]);
        });

        it('is done when every held plan has a result', () => {
            const step = stepFor(SetupStep.ExpectedValueComputed, {
                expectedValuePlanSerials: new Set([EVAL_PLAN.serial]),
                ledger: ledger({ accounts: [account(EVAL_PLAN)] }),
            });
            expect(step.status).toBe(SetupStepStatus.Done);
        });
    });

    describe('CostsEntered', () => {
        it('is missing for an eval account with no eval purchase fee', () => {
            const held = account(EVAL_PLAN, { label: 'Eval one' });
            const step = stepFor(SetupStep.CostsEntered, {
                ledger: ledger({ accounts: [held] }),
            });
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([
                {
                    accountId: held.id,
                    kind: SetupMissingKind.Account,
                    label: 'Eval one',
                },
            ]);
        });

        it('is done once the eval purchase fee is entered', () => {
            const held = account(EVAL_PLAN);
            const book = ledger({
                accounts: [held],
                fees: [purchaseFee(held, FeeKind.EvalPurchase)],
            });
            const step = stepFor(SetupStep.CostsEntered, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('does not accept a reset or a subscription as the purchase fee', () => {
            const held = account(EVAL_PLAN);
            const book = ledger({
                accounts: [held],
                fees: [
                    purchaseFee(held, FeeKind.Reset),
                    purchaseFee(held, FeeKind.Subscription),
                ],
            });
            const step = stepFor(SetupStep.CostsEntered, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.Missing);
        });

        it('asks an instant-funded account for its activation fee, not an eval purchase', () => {
            const held = account(INSTANT_PLAN);
            const evalOnly = ledger({
                accounts: [held],
                fees: [purchaseFee(held, FeeKind.EvalPurchase)],
            });
            const withActivation = ledger({
                accounts: [held],
                fees: [purchaseFee(held, FeeKind.Activation)],
            });
            const missing = stepFor(SetupStep.CostsEntered, {
                ledger: evalOnly,
            });
            const done = stepFor(SetupStep.CostsEntered, {
                ledger: withActivation,
            });
            expect(missing.status).toBe(SetupStepStatus.Missing);
            expect(done.status).toBe(SetupStepStatus.Done);
        });

        it('ignores another user fee row and an ended account', () => {
            const ended = account(EVAL_PLAN, { status: AccountStatus.Busted });
            const held = account(EVAL_PLAN);
            const foreignFee = fee(
                held,
                FeeKind.EvalPurchase,
                15_000,
                '2026-09-01',
                { userId: 'user-b' },
            );
            const book = ledger({
                accounts: [ended, held],
                fees: [foreignFee],
            });
            const step = stepFor(SetupStep.CostsEntered, { ledger: book });
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toHaveLength(1);
        });

        it('asks a ledger-only account for either purchase fee', () => {
            const ledgerOnly = account(EVAL_PLAN, {
                planLabel: 'Hola 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            });
            const without = ledger({ accounts: [ledgerOnly] });
            const withFee = ledger({
                accounts: [ledgerOnly],
                fees: [purchaseFee(ledgerOnly, FeeKind.Activation)],
            });
            const missing = stepFor(SetupStep.CostsEntered, {
                ledger: without,
            });
            const done = stepFor(SetupStep.CostsEntered, { ledger: withFee });
            expect(missing.status).toBe(SetupStepStatus.Missing);
            expect(done.status).toBe(SetupStepStatus.Done);
        });
    });

    it('is complete only when every step is done', () => {
        const held = account(EVAL_PLAN);
        const complete = checklistOf({
            expectedValuePlanSerials: new Set([EVAL_PLAN.serial]),
            ledger: ledger({
                accounts: [held],
                fees: [purchaseFee(held, FeeKind.EvalPurchase)],
                transfers: [deposit()],
            }),
        });
        expect(complete.isComplete).toBe(true);
        expect(complete.doneCount).toBe(5);
        const incomplete = checklistOf({
            ledger: ledger({ accounts: [held] }),
        });
        expect(incomplete.isComplete).toBe(false);
    });
});

describe('heldPlanGroupsOf', () => {
    it('keeps a plan group that has an active or suspended unarchived account', () => {
        const suspended = account(EVAL_PLAN, {
            status: AccountStatus.Suspended,
        });
        const ended = account(INSTANT_PLAN, { status: AccountStatus.Busted });
        const book = ledger({ accounts: [suspended, ended] });
        const groups = heldPlanGroupsOf(book);
        expect(groups.map((group) => group.planSerial)).toEqual([
            EVAL_PLAN.serial,
        ]);
    });
});
