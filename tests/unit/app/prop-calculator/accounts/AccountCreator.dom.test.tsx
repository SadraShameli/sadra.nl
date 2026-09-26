import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AccountCreator,
    AccountEditor,
} from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import {
    AccountStage,
    AccountStatus,
    DashboardBalanceConvention,
    PlanOptIn,
    SnapshotField,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanOptIns,
    serializePlanId,
    type TradingFirm,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/advisor';

const harness = vi.hoisted(() => ({
    create: vi.fn(() => Promise.resolve({ id: 'created-account' })),
    mutation: () => ({
        isPending: false,
        mutateAsync: () => Promise.resolve(),
    }),
    query: <T,>(data: T) => ({
        data,
        error: null,
        isError: false,
        isPending: false,
    }),
    storedAccount: vi.fn((): unknown => null),
    update: vi.fn(() => Promise.resolve({ id: 'stored-account' })),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: { useMutation: harness.mutation },
                create: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.create,
                    }),
                },
                get: { useQuery: () => harness.query(harness.storedAccount()) },
                list: { useQuery: () => harness.query([]) },
                remove: { useMutation: harness.mutation },
                unarchive: { useMutation: harness.mutation },
                update: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.update,
                    }),
                },
            },
            copyGroup: { list: { useQuery: () => harness.query([]) } },
            snapshot: { create: { useMutation: harness.mutation } },
        },
        useUtils: () => ({
            propAccounts: { invalidate: () => Promise.resolve() },
        }),
    },
}));

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function findFirmPlan(isWanted: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isWanted);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no modeled plan matches');
}

const withFundedReset = findFirmPlan((plan) => plan.fundedReset !== null);

describe('AccountCreator prefilled opt-ins', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(optIns: PlanOptIns) {
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={withFundedReset.firm.id}
                    initialOptIns={optIns}
                    initialPlan={serializePlanId(withFundedReset.plan.id)}
                />,
            );
        });
    }

    function fundedResetBox(): HTMLElement | null {
        return container.querySelector<HTMLElement>(
            `#account-opt-in-${PlanOptIn.FundedReset}`,
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('starts with a prefilled taken opt-in ticked', () => {
        render({ takesFundedReset: true, takesOneTimeEarlyWithdrawal: false });
        expect(fundedResetBox()?.getAttribute('aria-checked')).toBe('true');
    });

    it('starts unticked when the prefill takes no opt-in', () => {
        render(NO_PLAN_OPT_INS);
        expect(fundedResetBox()?.getAttribute('aria-checked')).toBe('false');
    });
});

const BALANCE_ERROR_SELECTOR = `#snapshot-${SnapshotField.Balance}-error`;
const BALANCE_WARNING_SELECTOR = `#snapshot-${SnapshotField.Balance}-warning`;

function chooseSelectValue(container: HTMLElement, value: string) {
    const select = [...container.querySelectorAll('select')].find((candidate) =>
        [...candidate.options].some((option) => option.value === value),
    );
    if (select === undefined) throw new Error(`no select offering ${value}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
        )?.set?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function inputIn(container: HTMLElement, selector: string): HTMLInputElement {
    const found = container.querySelector<HTMLInputElement>(selector);
    if (found === null) throw new Error(`no input ${selector}`);
    return found;
}

async function submitForm(container: HTMLElement) {
    const form = container.querySelector('form');
    if (form === null) throw new Error('no form');
    await act(async () => {
        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function typeInto(element: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set?.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

const fiftyKEval = findFirmPlan(
    (plan) =>
        plan.accountSize === 50_000 &&
        !plan.isInstantFunded &&
        plan.drawdownFor(TradingPhase.Eval).kind === DrawdownKind.EodTrailing,
);

describe('AccountCreator initial snapshot plausibility', () => {
    let container: HTMLDivElement;
    let root: Root;

    function input(selector: string): HTMLInputElement {
        const found = container.querySelector<HTMLInputElement>(selector);
        if (found === null) throw new Error(`no input ${selector}`);
        return found;
    }

    function snapshotInput(field: SnapshotField): HTMLInputElement {
        return input(`#snapshot-${field}`);
    }

    function chooseConvention(convention: DashboardBalanceConvention) {
        const wanted: string = convention;
        const select = [...container.querySelectorAll('select')].find(
            (candidate) =>
                [...candidate.options].some(
                    (option) => option.value === wanted,
                ),
        );
        if (select === undefined) throw new Error('no convention select');
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLSelectElement.prototype,
                'value',
            )?.set?.call(select, convention);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    async function submit() {
        const form = container.querySelector('form');
        if (form === null) throw new Error('no form');
        await act(async () => {
            form.dispatchEvent(
                new Event('submit', { bubbles: true, cancelable: true }),
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    function balanceError(): null | string {
        const error = container.querySelector(BALANCE_ERROR_SELECTOR);
        if (error === null) return null;
        const describedBy =
            snapshotInput(SnapshotField.Balance).getAttribute(
                'aria-describedby',
            ) ?? '';
        expect(describedBy.split(' ')).toContain(error.id);
        return error.textContent;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.create.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={fiftyKEval.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(fiftyKEval.plan.id)}
                />,
            );
        });
        typeInto(input('input[name="label"]'), 'Plausibility 50K');
        typeInto(snapshotInput(SnapshotField.Balance), '2,400');
        typeInto(snapshotInput(SnapshotField.HighestEodBalance), '2,400');
        typeInto(snapshotInput(SnapshotField.TradingDays), '3');
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('refuses 2,400 on a nominal 50K account with the convention message on the balance and saves nothing', async () => {
        await submit();

        expect(
            snapshotInput(SnapshotField.Balance).getAttribute('aria-invalid'),
        ).toBe('true');
        expect(balanceError()).toContain(
            'set the dashboard convention to $0-based',
        );
        expect(harness.create).not.toHaveBeenCalled();
    });

    it('clears the convention message once the account is $0-based and then saves', async () => {
        await submit();
        chooseConvention(DashboardBalanceConvention.ZeroBased);

        expect(
            snapshotInput(SnapshotField.Balance).getAttribute('aria-invalid'),
        ).toBe('false');
        expect(balanceError()).toBeNull();

        await submit();

        expect(harness.create).toHaveBeenCalledTimes(1);
        expect(harness.create).toHaveBeenCalledWith(
            expect.objectContaining({
                dashboardConvention: DashboardBalanceConvention.ZeroBased,
                label: 'Plausibility 50K',
            }),
        );
    });

    it('only warns about a balance far above the account size and still saves', async () => {
        const { plan } = fiftyKEval;
        const aboveCeiling = String(
            plan.accountSize +
                plan.profitTarget +
                plan.drawdownFor(TradingPhase.Eval).amount +
                200,
        );
        typeInto(snapshotInput(SnapshotField.Balance), aboveCeiling);
        typeInto(snapshotInput(SnapshotField.HighestEodBalance), aboveCeiling);

        const balance = snapshotInput(SnapshotField.Balance);
        const warning = container.querySelector(BALANCE_WARNING_SELECTOR);
        expect(warning?.textContent).toContain(
            'above the $50,000 account size',
        );
        expect(
            (balance.getAttribute('aria-describedby') ?? '').split(' '),
        ).toContain(warning?.id);
        expect(balance.getAttribute('aria-invalid')).toBe('false');

        await submit();

        expect(balanceError()).toBeNull();
        expect(harness.create).toHaveBeenCalledTimes(1);
    });
});

interface DocumentedLiveStartPlan extends FirmPlan {
    readonly highestStart: number;
    readonly lowestStart: number;
}

function documentedLiveStartPlan(): DocumentedLiveStartPlan {
    for (const firm of ALL_FIRMS) {
        for (const plan of firm.plans) {
            const applicability = livePlanApplicability(plan.id);
            if (
                plan.isInstantFunded ||
                applicability.kind !== LiveApplicabilityKind.Builder
            ) {
                continue;
            }
            const range = applicability.documentedStart?.(plan.accountSize);
            if (range !== undefined) {
                return {
                    firm,
                    highestStart: range.highest,
                    lowestStart: range.lowest,
                    plan,
                };
            }
        }
    }
    throw new Error('no plan with a documented live start');
}

describe('AccountCreator live start balance', () => {
    const livePlan = documentedLiveStartPlan();
    let container: HTMLDivElement;
    let root: Root;

    function liveStartInput(): HTMLInputElement {
        return inputIn(container, 'input[name="liveStartBalanceCents"]');
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.create.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={livePlan.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(livePlan.plan.id)}
                />,
            );
        });
        typeInto(inputIn(container, 'input[name="label"]'), 'Live start');
        chooseSelectValue(container, AccountStage.Live);
        typeInto(
            inputIn(container, 'input[name="fundedOn"]'),
            inputIn(container, 'input[name="purchasedOn"]').value,
        );
        const includeSnapshot = container.querySelector<HTMLElement>(
            '#account-include-snapshot',
        );
        act(() => {
            includeSnapshot?.click();
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('refuses a live start outside the documented range on the live start field, even without a snapshot', async () => {
        typeInto(liveStartInput(), String(livePlan.highestStart + 10_000));

        await submitForm(container);

        const input = liveStartInput();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        const messageIds = (input.getAttribute('aria-describedby') ?? '').split(
            ' ',
        );
        const message = messageIds
            .map(
                (id) =>
                    container.querySelector(`[id="${CSS.escape(id)}"]`)
                        ?.textContent ?? '',
            )
            .join(' ');
        expect(message).toContain('live account');
        expect(harness.create).not.toHaveBeenCalled();
    });

    it('saves once the live start is inside the documented range', async () => {
        typeInto(liveStartInput(), String(livePlan.highestStart + 10_000));
        await submitForm(container);
        typeInto(liveStartInput(), String(livePlan.lowestStart));

        await submitForm(container);

        expect(liveStartInput().getAttribute('aria-invalid')).toBe('false');
        expect(harness.create).toHaveBeenCalledTimes(1);
        expect(harness.create).toHaveBeenCalledWith(
            expect.objectContaining({
                liveStartBalanceCents: Math.round(livePlan.lowestStart * 100),
                stage: AccountStage.Live,
            }),
        );
    });
});

interface LiveLockPlan extends FirmPlan {
    readonly drawdownAmount: number;
    readonly liveStart: number;
}

function liveLockTriggerPlan(): LiveLockPlan {
    for (const firm of ALL_FIRMS) {
        for (const plan of firm.plans) {
            const applicability = livePlanApplicability(plan.id);
            if (
                plan.isInstantFunded ||
                applicability.kind !== LiveApplicabilityKind.Builder
            ) {
                continue;
            }
            const drawdown = applicability.builder(
                applicability.defaultCushionPercent,
            ).liveDrawdown;
            const trigger = drawdown?.lock?.atProfit ?? null;
            if (
                trigger === null ||
                trigger <= LIVE_PROFIT_BELOW_LOCK ||
                drawdown?.kind !== DrawdownKind.EodTrailing
            ) {
                continue;
            }
            return {
                drawdownAmount: drawdown.amount,
                firm,
                liveStart:
                    applicability.documentedStart?.(plan.accountSize).lowest ??
                    0,
                plan,
            };
        }
    }
    throw new Error('no live plan whose drawdown locks at a profit level');
}

const LIVE_PROFIT_BELOW_LOCK = 500;

describe('AccountCreator initial snapshot on a live account', () => {
    const livePlan = liveLockTriggerPlan();
    const balance = livePlan.liveStart + LIVE_PROFIT_BELOW_LOCK;
    let container: HTMLDivElement;
    let root: Root;

    function snapshotInput(field: SnapshotField): HTMLInputElement {
        return inputIn(container, `#snapshot-${field}`);
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.create.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={livePlan.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(livePlan.plan.id)}
                />,
            );
        });
        typeInto(inputIn(container, 'input[name="label"]'), 'Live lock');
        chooseSelectValue(container, AccountStage.Live);
        typeInto(
            inputIn(container, 'input[name="fundedOn"]'),
            inputIn(container, 'input[name="purchasedOn"]').value,
        );
        typeInto(
            inputIn(container, 'input[name="liveStartBalanceCents"]'),
            String(livePlan.liveStart),
        );
        typeInto(snapshotInput(SnapshotField.Balance), String(balance));
        typeInto(
            snapshotInput(SnapshotField.HighestEodBalance),
            String(balance),
        );
        typeInto(snapshotInput(SnapshotField.TradingDays), '3');
        typeInto(snapshotInput(SnapshotField.PayoutsTaken), '0');
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('refuses a dashboard floor further below the balance than the live drawdown before the lock, and saves nothing', async () => {
        typeInto(
            snapshotInput(SnapshotField.DashboardFloor),
            String(balance - livePlan.drawdownAmount - 500),
        );

        await submitForm(container);

        const floor = snapshotInput(SnapshotField.DashboardFloor);
        expect(floor.getAttribute('aria-invalid')).toBe('true');
        expect(
            container.querySelector(
                `#snapshot-${SnapshotField.DashboardFloor}-error`,
            )?.textContent,
        ).toContain('trailing drawdown allows before it locks');
        expect(harness.create).not.toHaveBeenCalled();
    });

    it('saves a dashboard floor within the live drawdown of the balance', async () => {
        typeInto(
            snapshotInput(SnapshotField.DashboardFloor),
            String(balance - livePlan.drawdownAmount),
        );

        await submitForm(container);

        expect(
            snapshotInput(SnapshotField.DashboardFloor).getAttribute(
                'aria-invalid',
            ),
        ).toBe('false');
        expect(harness.create).toHaveBeenCalledTimes(1);
        expect(harness.create).toHaveBeenCalledWith(
            expect.objectContaining({
                liveStartBalanceCents: Math.round(livePlan.liveStart * 100),
                stage: AccountStage.Live,
            }),
        );
    });
});

describe('AccountCreator live start issue placement', () => {
    const livePlan = documentedLiveStartPlan();
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.create.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={livePlan.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(livePlan.plan.id)}
                />,
            );
        });
        typeInto(inputIn(container, 'input[name="label"]'), 'Live twice');
        chooseSelectValue(container, AccountStage.Live);
        typeInto(
            inputIn(container, 'input[name="fundedOn"]'),
            inputIn(container, 'input[name="purchasedOn"]').value,
        );
        const start = String(livePlan.lowestStart);
        typeInto(
            inputIn(container, `#snapshot-${SnapshotField.Balance}`),
            start,
        );
        typeInto(
            inputIn(container, `#snapshot-${SnapshotField.HighestEodBalance}`),
            start,
        );
        typeInto(
            inputIn(container, `#snapshot-${SnapshotField.TradingDays}`),
            '3',
        );
        typeInto(
            inputIn(container, `#snapshot-${SnapshotField.PayoutsTaken}`),
            '0',
        );
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows an out-of-range live start once, on the live start field, not again in the snapshot banner', async () => {
        typeInto(
            inputIn(container, 'input[name="liveStartBalanceCents"]'),
            String(livePlan.highestStart + 10_000),
        );

        await submitForm(container);

        const text = container.textContent;
        expect(text.split('A live account after').length - 1).toBe(1);
        expect(
            inputIn(
                container,
                'input[name="liveStartBalanceCents"]',
            ).getAttribute('aria-invalid'),
        ).toBe('true');
        expect(harness.create).not.toHaveBeenCalled();
    });
});

describe('AccountEditor live start on a funded account', () => {
    const livePlan = documentedLiveStartPlan();
    const outOfRangeCents = Math.round((livePlan.highestStart + 10_000) * 100);
    let container: HTMLDivElement;
    let root: Root;

    function liveStartInput(): HTMLInputElement {
        return inputIn(container, 'input[name="liveStartBalanceCents"]');
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.update.mockClear();
        harness.storedAccount.mockReturnValue({
            accountSize: livePlan.plan.accountSize,
            archivedAt: null,
            copyGroupId: null,
            createdAt: new Date('2026-09-01T12:00:00Z'),
            dashboardConvention: DashboardBalanceConvention.Nominal,
            externalAlias: null,
            firmId: livePlan.firm.id,
            firstFundedTradeOn: null,
            fundedOn: '2026-09-02',
            id: 'stored-account',
            label: 'Funded with a live start',
            liveStartBalanceCents: outOfRangeCents,
            notes: null,
            optIns: NO_PLAN_OPT_INS,
            personalRules: {},
            planRulesFingerprint: null,
            planSerial: serializePlanId(livePlan.plan.id),
            purchasedOn: '2026-09-01',
            readIssues: [],
            replacesAccountId: null,
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
            tags: [],
            updatedAt: new Date('2026-09-01T12:00:00Z'),
            userId: 'user-1',
        });
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<AccountEditor id="stored-account" />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
        harness.storedAccount.mockReturnValue(null);
    });

    it('refuses a stored live start outside the documented range before the account moves live, and saves nothing', async () => {
        await submitForm(container);

        expect(liveStartInput().getAttribute('aria-invalid')).toBe('true');
        expect(container.textContent).toContain('A live account after');
        expect(harness.update).not.toHaveBeenCalled();
    });

    it('saves once the live start is inside the documented range', async () => {
        typeInto(liveStartInput(), String(livePlan.lowestStart));

        await submitForm(container);

        expect(liveStartInput().getAttribute('aria-invalid')).toBe('false');
        expect(harness.update).toHaveBeenCalledTimes(1);
        expect(harness.update).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'stored-account',
                liveStartBalanceCents: Math.round(livePlan.lowestStart * 100),
            }),
        );
    });
});
