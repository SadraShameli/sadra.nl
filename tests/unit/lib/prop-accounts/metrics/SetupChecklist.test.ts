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

const NO_STALE: ReadonlySet<string> = new Set();

function inputsOf(
    overrides: Partial<SetupChecklistInputs> & {
        readonly ledger: SetupChecklistInputs['ledger'];
    },
): SetupChecklistInputs {
    return {
        expectedValuePlanSerials: new Set(),
        rulebook: DEFAULT_RULEBOOK,
        staleSnapshotAccountIds: NO_STALE,
        ...overrides,
    };
}

function stepOf(
    result: ReturnType<typeof setupChecklistOf>,
    step: SetupStep,
): SetupStepResult {
    const found = result.steps.find((candidate) => candidate.step === step);
    if (found === undefined) throw new Error(`missing step ${step}`);
    return found;
}

describe('setupChecklistOf', () => {
    it('lists the five steps in order', () => {
        const result = setupChecklistOf(inputsOf({ ledger: ledger({}) }));
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
            const step = stepOf(
                setupChecklistOf(inputsOf({ ledger: ledger({}) })),
                SetupStep.BudgetSet,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([{ kind: SetupMissingKind.Bankroll }]);
        });

        it('is done once a deposit exists', () => {
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            transfers: [
                                transfer(
                                    BankrollTransferKind.Deposit,
                                    500_000,
                                    '2026-09-01',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.BudgetSet,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
            expect(step.missing).toEqual([]);
        });

        it('does not count a personal withdrawal as a budget', () => {
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            transfers: [
                                transfer(
                                    BankrollTransferKind.Withdrawal,
                                    100_000,
                                    '2026-09-01',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.BudgetSet,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
        });

        it('is done once a bankroll setting is set, without any deposit', () => {
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({}),
                        rulebook: {
                            ...DEFAULT_RULEBOOK,
                            bankroll: {
                                ...DEFAULT_RULEBOOK.bankroll,
                                defaultRoundBudgetCents: 300_000,
                            },
                        },
                    }),
                ),
                SetupStep.BudgetSet,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('does not treat the round gap default as a budget setting', () => {
            expect(DEFAULT_RULEBOOK.bankroll.roundGapDays).not.toBeNull();
            const step = stepOf(
                setupChecklistOf(inputsOf({ ledger: ledger({}) })),
                SetupStep.BudgetSet,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
        });
    });

    describe('with no active account', () => {
        it('marks the account-dependent steps not applicable instead of done', () => {
            const result = setupChecklistOf(inputsOf({ ledger: ledger({}) }));
            for (const step of [
                SetupStep.CostsEntered,
                SetupStep.ExpectedValueComputed,
                SetupStep.FirmRulesVerified,
                SetupStep.StagesCaptured,
            ]) {
                expect(stepOf(result, step).status).toBe(
                    SetupStepStatus.NotApplicable,
                );
            }
            expect(result.isComplete).toBe(false);
        });

        it('treats archived and ended accounts as not held', () => {
            const ended = account(EVAL_PLAN, { status: AccountStatus.Busted });
            const archived = account(EVAL_PLAN, { archivedAt: new Date() });
            const result = setupChecklistOf(
                inputsOf({ ledger: ledger({ accounts: [ended, archived] }) }),
            );
            expect(stepOf(result, SetupStep.FirmRulesVerified).status).toBe(
                SetupStepStatus.NotApplicable,
            );
        });
    });

    describe('FirmRulesVerified', () => {
        it('is done and shows the verification date of every held firm', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({ ledger: ledger({ accounts: [held] }) }),
                ),
                SetupStep.FirmRulesVerified,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
            expect(step.firmDates).toEqual([
                {
                    firmId: EVAL_PLAN.firm.id,
                    verifiedOn: firmDataProvenance(EVAL_PLAN.firm.id)
                        .verifiedOn,
                },
            ]);
        });

        it('is missing for a held firm that has no verification date', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        firmVerificationDateOf: () => null,
                        ledger: ledger({ accounts: [held] }),
                    }),
                ),
                SetupStep.FirmRulesVerified,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([
                {
                    firmId: EVAL_PLAN.firm.id,
                    kind: SetupMissingKind.Firm,
                    label: expect.any(String),
                },
            ]);
        });

        it('rejects a verification date that is not a real calendar date', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        firmVerificationDateOf: () => '2026-02-31',
                        ledger: ledger({ accounts: [held] }),
                    }),
                ),
                SetupStep.FirmRulesVerified,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
        });

        it('lists each held firm once even with several plans', () => {
            const first = account(EVAL_PLAN);
            const second = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({ ledger: ledger({ accounts: [first, second] }) }),
                ),
                SetupStep.FirmRulesVerified,
            );
            expect(step.firmDates).toHaveLength(1);
        });
    });

    describe('StagesCaptured', () => {
        it('is done when no active modeled account is flagged stale', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({ ledger: ledger({ accounts: [held] }) }),
                ),
                SetupStep.StagesCaptured,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('lists each active account the stale snapshot rule flags', () => {
            const stale = account(EVAL_PLAN, { label: 'Stale one' });
            const fresh = account(EVAL_PLAN, { label: 'Fresh one' });
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({ accounts: [stale, fresh] }),
                        staleSnapshotAccountIds: new Set([stale.id]),
                    }),
                ),
                SetupStep.StagesCaptured,
            );
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
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({ accounts: [ended, held] }),
                        staleSnapshotAccountIds: new Set([ended.id]),
                    }),
                ),
                SetupStep.StagesCaptured,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('does not ask a ledger-only account for a snapshot', () => {
            const ledgerOnly = account(EVAL_PLAN, {
                planLabel: 'Hola 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            });
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({ accounts: [ledgerOnly] }),
                        staleSnapshotAccountIds: new Set([ledgerOnly.id]),
                    }),
                ),
                SetupStep.StagesCaptured,
            );
            expect(step.status).toBe(SetupStepStatus.NotApplicable);
        });
    });

    describe('ExpectedValueComputed', () => {
        it('is not checked while the engine has not answered', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        expectedValuePlanSerials: null,
                        ledger: ledger({ accounts: [held] }),
                    }),
                ),
                SetupStep.ExpectedValueComputed,
            );
            expect(step.status).toBe(SetupStepStatus.NotChecked);
        });

        it('is missing for a held plan with no result', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        expectedValuePlanSerials: new Set(),
                        ledger: ledger({ accounts: [held] }),
                    }),
                ),
                SetupStep.ExpectedValueComputed,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toEqual([
                {
                    kind: SetupMissingKind.Plan,
                    label: expect.any(String),
                    planSerial: EVAL_PLAN.serial,
                },
            ]);
        });

        it('is done when every held plan has a result', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        expectedValuePlanSerials: new Set([EVAL_PLAN.serial]),
                        ledger: ledger({ accounts: [held] }),
                    }),
                ),
                SetupStep.ExpectedValueComputed,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
        });
    });

    describe('CostsEntered', () => {
        it('is missing for an eval account with no eval purchase fee', () => {
            const held = account(EVAL_PLAN, { label: 'Eval one' });
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({ ledger: ledger({ accounts: [held] }) }),
                ),
                SetupStep.CostsEntered,
            );
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
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            accounts: [held],
                            fees: [
                                fee(
                                    held,
                                    FeeKind.EvalPurchase,
                                    15_000,
                                    '2026-09-01',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.CostsEntered,
            );
            expect(step.status).toBe(SetupStepStatus.Done);
        });

        it('does not accept a reset or a subscription as the purchase fee', () => {
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            accounts: [held],
                            fees: [
                                fee(held, FeeKind.Reset, 5000, '2026-09-02'),
                                fee(
                                    held,
                                    FeeKind.Subscription,
                                    5000,
                                    '2026-09-02',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.CostsEntered,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
        });

        it('asks an instant-funded account for its activation fee, not an eval purchase', () => {
            const held = account(INSTANT_PLAN);
            const withEvalOnly = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            accounts: [held],
                            fees: [
                                fee(
                                    held,
                                    FeeKind.EvalPurchase,
                                    15_000,
                                    '2026-09-01',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.CostsEntered,
            );
            expect(withEvalOnly.status).toBe(SetupStepStatus.Missing);
            const withActivation = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            accounts: [held],
                            fees: [
                                fee(
                                    held,
                                    FeeKind.Activation,
                                    15_000,
                                    '2026-09-01',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.CostsEntered,
            );
            expect(withActivation.status).toBe(SetupStepStatus.Done);
        });

        it('ignores another user fee row and an ended account', () => {
            const ended = account(EVAL_PLAN, { status: AccountStatus.Busted });
            const held = account(EVAL_PLAN);
            const step = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            accounts: [ended, held],
                            fees: [
                                fee(
                                    held,
                                    FeeKind.EvalPurchase,
                                    15_000,
                                    '2026-09-01',
                                    { userId: 'user-b' },
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.CostsEntered,
            );
            expect(step.status).toBe(SetupStepStatus.Missing);
            expect(step.missing).toHaveLength(1);
        });

        it('asks a ledger-only account for either purchase fee', () => {
            const ledgerOnly = account(EVAL_PLAN, {
                planLabel: 'Hola 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            });
            const missing = stepOf(
                setupChecklistOf(
                    inputsOf({ ledger: ledger({ accounts: [ledgerOnly] }) }),
                ),
                SetupStep.CostsEntered,
            );
            expect(missing.status).toBe(SetupStepStatus.Missing);
            const done = stepOf(
                setupChecklistOf(
                    inputsOf({
                        ledger: ledger({
                            accounts: [ledgerOnly],
                            fees: [
                                fee(
                                    ledgerOnly,
                                    FeeKind.Activation,
                                    9000,
                                    '2026-09-01',
                                ),
                            ],
                        }),
                    }),
                ),
                SetupStep.CostsEntered,
            );
            expect(done.status).toBe(SetupStepStatus.Done);
        });
    });

    it('is complete only when every step is done', () => {
        const held = account(EVAL_PLAN);
        const complete = setupChecklistOf(
            inputsOf({
                expectedValuePlanSerials: new Set([EVAL_PLAN.serial]),
                ledger: ledger({
                    accounts: [held],
                    fees: [
                        fee(held, FeeKind.EvalPurchase, 15_000, '2026-09-01'),
                    ],
                    transfers: [
                        transfer(
                            BankrollTransferKind.Deposit,
                            500_000,
                            '2026-09-01',
                        ),
                    ],
                }),
            }),
        );
        expect(complete.isComplete).toBe(true);
        expect(complete.doneCount).toBe(5);
        const incomplete = setupChecklistOf(
            inputsOf({ ledger: ledger({ accounts: [held] }) }),
        );
        expect(incomplete.isComplete).toBe(false);
    });
});

describe('heldPlanGroupsOf', () => {
    it('keeps a plan group that has an active or suspended unarchived account', () => {
        const suspended = account(EVAL_PLAN, {
            status: AccountStatus.Suspended,
        });
        const ended = account(INSTANT_PLAN, { status: AccountStatus.Busted });
        const groups = heldPlanGroupsOf(
            ledger({ accounts: [suspended, ended] }),
        );
        expect(groups.map((group) => group.planSerial)).toEqual([
            EVAL_PLAN.serial,
        ]);
    });
});
