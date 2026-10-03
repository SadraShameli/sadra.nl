import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type SetupChecklistCardModel,
    setupChecklistCardOf,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    SetupChecklistCard,
    SetupChecklistCompact,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/SetupChecklistCard';
import {
    BankrollTransferKind,
    FeeKind,
} from '~/lib/prop-accounts/core';
import { setupChecklistOf, SetupStep } from '~/lib/prop-accounts/metrics';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

import {
    account,
    EVAL_PLAN,
    fee,
    ledger,
    transfer,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const COMPACT_HREF = routes.propCalculator.accounts.index;

function hrefsOf(container: HTMLElement): readonly string[] {
    return [...container.querySelectorAll('a')].map(
        (anchor) => anchor.getAttribute('href') ?? '',
    );
}

function modelOf(options: {
    readonly hub: boolean;
    readonly withCosts: boolean;
}): SetupChecklistCardModel {
    const held = account(EVAL_PLAN, { label: 'Eval one' });
    const checklist = setupChecklistOf({
        expectedValuePlanSerials: options.hub ? null : new Set(),
        ledger: ledger({
            accounts: [held],
            fees: options.withCosts
                ? [fee(held, FeeKind.EvalPurchase, 15_000, '2026-09-01')]
                : [],
            transfers: [
                transfer(BankrollTransferKind.Deposit, 500_000, '2026-09-01'),
            ],
        }),
        rulebook: DEFAULT_RULEBOOK,
        staleSnapshotAccountIds: new Set(),
    });
    const card = setupChecklistCardOf(checklist);
    return options.hub
        ? { ...card, totalSteps: card.totalSteps - 1 }
        : card;
}

describe('SetupChecklistCard', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: React.ReactNode) {
        act(() => {
            root.render(node);
        });
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

    describe('SetupChecklistCompact', () => {
        it('links every step to the target the overview card uses', () => {
            const model = modelOf({ hub: true, withCosts: true });
            render(<SetupChecklistCompact href={COMPACT_HREF} model={model} />);
            const hrefs = hrefsOf(container);
            for (const step of model.steps) {
                expect(hrefs).toContain(step.href);
            }
        });

        it('shows the expected value step as checked on the overview instead of dropping it', () => {
            const model = modelOf({ hub: true, withCosts: true });
            const evStep = model.steps.find(
                (step) => step.key === SetupStep.ExpectedValueComputed,
            );
            render(<SetupChecklistCompact href={COMPACT_HREF} model={model} />);
            expect(container.textContent).toContain(
                'Expected value: checked on the overview',
            );
            const anchor = [...container.querySelectorAll('a')].find(
                (candidate) =>
                    candidate.textContent ===
                    'Expected value: checked on the overview',
            );
            expect(anchor?.getAttribute('href')).toBe(evStep?.href);
        });

        it('says which steps the done count leaves out', () => {
            const model = modelOf({ hub: true, withCosts: true });
            render(<SetupChecklistCompact href={COMPACT_HREF} model={model} />);
            expect(container.textContent).toContain(
                `Setup: ${String(model.doneCount)} of ${String(model.totalSteps)} steps done.`,
            );
            expect(container.textContent).toContain(
                'The count leaves out the steps checked on the overview.',
            );
        });

        it('does not add the leaves-out note when every step is counted', () => {
            const model = modelOf({ hub: false, withCosts: true });
            render(<SetupChecklistCompact href={COMPACT_HREF} model={model} />);
            expect(container.textContent).not.toContain('leaves out');
        });

        it('links each missing item to its fix, as the overview card does', () => {
            const model = modelOf({ hub: true, withCosts: false });
            const costs = model.steps.find(
                (step) => step.key === SetupStep.CostsEntered,
            );
            expect(costs?.items.length).toBeGreaterThan(0);
            render(<SetupChecklistCompact href={COMPACT_HREF} model={model} />);
            const items = costs?.items ?? [];
            for (const item of items) {
                const anchor = [...container.querySelectorAll('a')].find(
                    (candidate) =>
                        candidate.getAttribute('href') === item.href &&
                        candidate.textContent === item.label,
                );
                expect(anchor).toBeDefined();
            }
        });

        it('keeps the finish link to the overview', () => {
            const model = modelOf({ hub: true, withCosts: true });
            render(<SetupChecklistCompact href={COMPACT_HREF} model={model} />);
            const finish = [...container.querySelectorAll('a')].find(
                (anchor) => anchor.textContent === 'Finish the setup',
            );
            expect(finish?.getAttribute('href')).toBe(COMPACT_HREF);
        });
    });

    describe('SetupChecklistCard', () => {
        it('renders the same step links and item links as before', () => {
            const model = modelOf({ hub: false, withCosts: false });
            render(<SetupChecklistCard model={model} />);
            const hrefs = hrefsOf(container);
            for (const step of model.steps) {
                expect(hrefs).toContain(step.href);
                for (const item of step.items) {
                    expect(hrefs).toContain(item.href);
                }
            }
            expect(container.textContent).toContain(
                `${String(model.doneCount)} of ${String(model.totalSteps)} steps done.`,
            );
        });
    });
});
