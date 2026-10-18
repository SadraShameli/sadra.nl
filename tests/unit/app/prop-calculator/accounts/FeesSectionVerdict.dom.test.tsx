import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeesSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/FeesSection';
import {
    FeeKind,
    feePrefillCents,
    formatUsdCents,
    usdCents,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, type Plan } from '~/lib/prop-calculator';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';

const harness = vi.hoisted(() => {
    function procedure(): unknown {
        return new Proxy(
            {},
            {
                get: (_target, key) => {
                    if (key === 'useQuery') {
                        return () => ({ data: undefined, error: null });
                    }
                    if (key === 'useMutation') {
                        return () => ({
                            isPending: false,
                            mutate: vi.fn(),
                            mutateAsync: vi.fn(),
                        });
                    }
                    return procedure();
                },
            },
        );
    }
    return { procedure };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: harness.procedure(),
        useUtils: () => ({
            propAccounts: { invalidate: () => Promise.resolve() },
        }),
    },
}));

function pricedPlan(): { listCents: number; plan: Plan } {
    for (const firm of ALL_FIRMS) {
        for (const plan of firm.plans) {
            const listCents = feePrefillCents(plan, FeeKind.EvalPurchase);
            if (listCents !== null && listCents > 2000) {
                return { listCents, plan };
            }
        }
    }
    throw new Error('no plan with an eval list price above 20 dollars');
}

const { listCents: LIST_CENTS, plan: PLAN } = pricedPlan();

function feeRow(
    id: string,
    kind: FeeKind,
    amountCents: number,
    paidOn: string,
) {
    return {
        accountId: ACCOUNT_ID,
        amountCents: usdCents(amountCents),
        createdAt: new Date('2026-09-01T12:00:00Z'),
        id,
        kind,
        note: null,
        paidOn,
        updatedAt: new Date('2026-09-01T12:00:00Z'),
        userId: 'user-a',
    };
}

describe('the fee row shows its price verdict (PT-91, F-V32)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(plan: null | Plan, rows: ReturnType<typeof feeRow>[]) {
        act(() => {
            root.render(
                <FeesSection
                    accountId={ACCOUNT_ID}
                    canRecord={false}
                    onFailure={vi.fn()}
                    plan={plan}
                    query={{ data: rows, error: null }}
                />,
            );
        });
    }

    function differenceCell(rowIndex: number): string {
        const rows = [...container.querySelectorAll(':scope tbody tr')];
        const cell = rows[rowIndex]?.querySelectorAll(':scope > td')[4];
        if (cell === undefined)
            throw new Error(`no difference cell ${rowIndex}`);
        return cell.textContent;
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

    it('prints Discounted with the signed difference for a fee below the list price', () => {
        render(PLAN, [
            feeRow('f1', FeeKind.EvalPurchase, LIST_CENTS - 1000, '2026-09-01'),
        ]);
        const text = differenceCell(0);
        expect(text).toContain('Discounted');
        expect(text).toContain(formatUsdCents(usdCents(-1000)));
        expect(formatUsdCents(usdCents(-1000))).toContain('-');
    });

    it('prints At list and Above list for the other two verdicts', () => {
        render(PLAN, [
            feeRow('f1', FeeKind.EvalPurchase, LIST_CENTS, '2026-09-01'),
            feeRow('f2', FeeKind.EvalPurchase, LIST_CENTS + 1500, '2026-09-02'),
        ]);
        expect(differenceCell(0)).toContain('At list');
        expect(differenceCell(0)).not.toContain('Discounted');
        expect(differenceCell(1)).toContain('Above list');
        expect(differenceCell(1)).toContain(formatUsdCents(usdCents(1500)));
    });

    it('prints No list price for a kind the plan does not price and for an account without a plan', () => {
        render(PLAN, [feeRow('f1', FeeKind.Other, 500, '2026-09-01')]);
        expect(differenceCell(0)).toContain('No list price');
        render(null, [
            feeRow('f2', FeeKind.EvalPurchase, LIST_CENTS, '2026-09-01'),
        ]);
        expect(differenceCell(0)).toContain('No list price');
    });
});

describe('the list price of a fee is computed in one place (PT-91, F-V32)', () => {
    const src = path.resolve(import.meta.dirname, '../../../../../src');
    const metrics = path.join(src, 'lib/prop-accounts/metrics');
    const feesSection = path.join(
        src,
        'app/(app)/prop-calculator/accounts/_components/detail/FeesSection.tsx',
    );

    it('finds feePrefillCents among the fee and reconciliation metrics files only in FeeReconciliation.ts', () => {
        const holders = readdirSync(metrics)
            .filter((file) => /^(Fee|Firm)Reconciliation\.ts$/.test(file))
            .filter((file) =>
                readFileSync(path.join(metrics, file), 'utf8').includes(
                    'feePrefillCents',
                ),
            );
        expect(holders).toEqual(['FeeReconciliation.ts']);
    });

    it('keeps no list price lookup or subtraction in the fee row', () => {
        const source = readFileSync(feesSection, 'utf8');
        expect(source).not.toContain('feePrefillCents(plan, row.kind)');
        expect(source).not.toContain('row.amountCents - listCents');
        expect(source).toContain('feeCheckRowOf');
    });
});
