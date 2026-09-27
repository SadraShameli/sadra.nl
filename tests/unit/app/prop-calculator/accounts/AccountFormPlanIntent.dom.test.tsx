import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import {
    AccountCreator,
    AccountEditor,
} from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    type FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    PlanAvailability,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

const reorderState = vi.hoisted(() => ({ enabled: false }));

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        findFirm(id: FirmId) {
            const real = actual.findFirm(id);
            if (real === undefined || !reorderState.enabled) return real;
            const discontinued = real.plans.find(
                (candidate) =>
                    candidate.availability ===
                    actual.PlanAvailability.Discontinued,
            );
            if (discontinued === undefined) return real;
            const reordered = [
                discontinued,
                ...real.plans.filter((candidate) => candidate !== discontinued),
            ];
            const clone = Object.create(
                Object.getPrototypeOf(real) as object,
            ) as TradingFirm;
            Object.assign(clone, real, { plans: reordered });
            return clone;
        },
    };
});

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutations = new Map<
        string,
        Mock<(input?: unknown) => Promise<unknown>>
    >();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateAsyncOf(path: string) {
        const existing = mutations.get(path);
        if (existing !== undefined) return existing;
        const created = vi.fn((_input?: unknown) =>
            Promise.resolve<unknown>({ id: 'created' }),
        );
        mutations.set(path, created);
        return created;
    }
    function node(path: readonly string[]): unknown {
        return new Proxy(
            {},
            {
                get(_target, key) {
                    if (typeof key !== 'string') return;
                    const name = path.join('.');
                    if (key === 'useQuery') {
                        return () => queries.get(name) ?? pending;
                    }
                    if (key === 'useMutation') {
                        return () => ({
                            isPending: false,
                            mutate: vi.fn(),
                            mutateAsync: mutateAsyncOf(name),
                        });
                    }
                    return key === 'invalidate' || key === 'cancel'
                        ? () => Promise.resolve()
                        : node([...path, key]);
                },
            },
        );
    }
    return {
        api: {
            propAccounts: node(['propAccounts']),
            useUtils: () => ({ propAccounts: node(['utils']) }),
        },
        mutateAsyncOf,
        queries,
        reset() {
            queries.clear();
            mutations.clear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({ api: harness.api }));

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function findFirmPlan(isMatch: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find((candidate) => isMatch(candidate));
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no plan matches the predicate');
}

const DISCONTINUED = findFirmPlan(
    (plan) => plan.availability === PlanAvailability.Discontinued,
);
const PURCHASABLE_SIBLING = (() => {
    const plan = DISCONTINUED.firm.plans.find(
        (candidate) => candidate.availability === PlanAvailability.Purchasable,
    );
    if (plan === undefined) {
        throw new Error('the discontinued plan firm has no purchasable plan');
    }
    return plan;
})();
const OTHER_FIRM_PLAN = (() => {
    const firm = ALL_FIRMS.find(
        (candidate) => candidate.id !== DISCONTINUED.firm.id,
    );
    const plan = firm?.plans[0];
    if (firm === undefined || plan === undefined) {
        throw new Error('no other firm to start from');
    }
    return { firm, plan };
})();

function chooseSelectValue(scope: ParentNode, value: string) {
    const select = [...scope.querySelectorAll('select')].find((candidate) =>
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

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function optionValues(scope: ParentNode): string[] {
    return [...scope.querySelectorAll('option')].map(
        (option) => option.value,
    );
}

function query(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

describe('the account form threads the new-purchase intent (PT-71f)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        reorderState.enabled = false;
        harness.queries.set('propAccounts.account.list', query([]));
        harness.queries.set('propAccounts.copyGroup.list', query([]));
        harness.queries.set('propAccounts.externalFirm.list', query([]));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        reorderState.enabled = false;
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('does not offer a discontinued plan when creating a modeled account', () => {
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={DISCONTINUED.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(PURCHASABLE_SIBLING.id)}
                />,
            );
        });
        expect(optionValues(container)).not.toContain(
            serializePlanId(DISCONTINUED.plan.id),
        );
    });

    it('does not offer a discontinued plan in the ledger-only new-purchase flow', () => {
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={DISCONTINUED.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(PURCHASABLE_SIBLING.id)}
                />,
            );
        });
        act(() => {
            element(container, '#account-ledger-only').click();
        });
        chooseSelectValue(
            container,
            firmKeyId({
                firmId: DISCONTINUED.firm.id,
                kind: FirmKeyKind.Modeled,
            }),
        );
        expect(optionValues(container)).not.toContain(
            serializePlanId(DISCONTINUED.plan.id),
        );
    });

    it('does not quick-select a discontinued plan when a firm lists it first in the ledger-only flow', () => {
        reorderState.enabled = true;
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={OTHER_FIRM_PLAN.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(OTHER_FIRM_PLAN.plan.id)}
                />,
            );
        });
        act(() => {
            element(container, '#account-ledger-only').click();
        });
        chooseSelectValue(
            container,
            firmKeyId({
                firmId: DISCONTINUED.firm.id,
                kind: FirmKeyKind.Modeled,
            }),
        );
        const planLabelField = element(
            container,
            'input[name="planLabel"]',
        ) as HTMLInputElement;
        expect(planLabelField.value).not.toBe(DISCONTINUED.plan.label);
    });

    it('keeps an existing account on a discontinued plan selectable when editing', async () => {
        const stored = {
            accountSize: DISCONTINUED.plan.id.accountSize,
            archivedAt: null,
            copyGroupId: null,
            createdAt: new Date('2026-08-01T12:00:00Z'),
            dashboardConvention: DashboardBalanceConvention.Nominal,
            externalAlias: null,
            externalFirmId: null,
            firmId: DISCONTINUED.firm.id,
            firstFundedTradeOn: null,
            fundedOn: null,
            id: 'a2c1e4b6-9d3f-4a7e-8b2c-1d3e5f6a7b8c',
            label: 'Legacy account',
            liveStartBalanceCents: null,
            notes: null,
            optIns: NO_PLAN_OPT_INS,
            personalRules: {},
            planLabel: null,
            planRulesFingerprint: null,
            planSerial: serializePlanId(DISCONTINUED.plan.id),
            purchasedOn: '2026-08-03',
            readIssues: [],
            replacesAccountId: null,
            roundId: null,
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
            tags: [],
            tracking: AccountTracking.Modeled,
            updatedAt: new Date('2026-08-01T12:00:00Z'),
            userId: 'user-a',
        };
        harness.queries.set('propAccounts.account.get', query(stored));
        act(() => {
            root.render(
                <AccountEditor id="a2c1e4b6-9d3f-4a7e-8b2c-1d3e5f6a7b8c" />,
            );
        });
        expect(optionValues(container)).toContain(
            serializePlanId(DISCONTINUED.plan.id),
        );
        expect(container.textContent).toContain('no longer sold');
    });
});
