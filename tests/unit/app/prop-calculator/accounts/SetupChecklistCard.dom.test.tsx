import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type SetupChecklistCardModel,
    setupChecklistCardOf,
    SetupRowStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    SetupChecklistCard,
    SetupChecklistCompact,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/SetupChecklistCard';
import { BankrollTransferKind, FeeKind } from '~/lib/prop-accounts/core';
import { setupChecklistOf, SetupStep } from '~/lib/prop-accounts/metrics';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    account,
    EVAL_PLAN,
    fee,
    ledger,
    transfer,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

function hrefsOf(container: HTMLElement): readonly string[] {
    return [...container.querySelectorAll('a')].map(
        (anchor) => anchor.getAttribute('href') ?? '',
    );
}

function modelOf(options: {
    readonly expectedValueFailure?: string;
    readonly hub: boolean;
    readonly withCosts: boolean;
}): SetupChecklistCardModel {
    const held = account(EVAL_PLAN, { label: 'Eval one' });
    const expectedValueFailure = options.expectedValueFailure ?? null;
    const checklist = setupChecklistOf({
        expectedValuePlanSerials:
            expectedValueFailure !== null || options.hub ? null : new Set(),
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
        staleSnapshotNotes: new Map(),
    });
    const card = setupChecklistCardOf(checklist, {
        expectedValueFailure,
        isCounting: false,
    });
    return options.hub ? { ...card, totalSteps: card.totalSteps - 1 } : card;
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
        it('gives every open step one action to the target the overview card uses', () => {
            const model = modelOf({ hub: true, withCosts: false });
            render(<SetupChecklistCompact model={model} />);
            const anchors = [...container.querySelectorAll('a')];
            const openSteps = model.steps.filter(
                (candidate) =>
                    candidate.status === SetupRowStatus.Missing ||
                    candidate.status === SetupRowStatus.NotChecked,
            );
            expect(openSteps.length).toBeGreaterThan(0);
            for (const step of openSteps) {
                const action = anchors.find(
                    (anchor) => anchor.textContent === step.actionLabel,
                );
                expect(action?.getAttribute('href')).toBe(step.href);
            }
        });

        it('keeps the expected value step as its own row instead of dropping it, and says it is not counted yet', () => {
            const model = modelOf({ hub: true, withCosts: true });
            const evStep = model.steps.find(
                (step) => step.key === SetupStep.ExpectedValueComputed,
            );
            render(<SetupChecklistCompact model={model} />);
            expect(container.textContent).toContain(
                `${evStep?.statusLabel ?? ''}: ${evStep?.label ?? ''}`,
            );
            expect(container.textContent).toContain(
                'not counted in the done total',
            );
        });

        it('shows the done count and a progress bar at the done share', () => {
            const model = modelOf({ hub: true, withCosts: true });
            render(<SetupChecklistCompact model={model} />);
            expect(container.textContent).toContain(
                `${String(model.doneCount)} of ${String(model.totalSteps)} steps done`,
            );
            const bar = container.querySelector(
                '[aria-label="Setup progress"]',
            );
            expect(bar?.getAttribute('aria-valuenow')).toBe(
                String((model.doneCount / model.totalSteps) * 100),
            );
        });

        it('lists each missing account in a table row linked to the account, as the overview card does', () => {
            const model = modelOf({ hub: true, withCosts: false });
            const costs = model.steps.find(
                (step) => step.key === SetupStep.CostsEntered,
            );
            expect(costs?.accounts.length).toBeGreaterThan(0);
            render(<SetupChecklistCompact model={model} />);
            const items = costs?.accounts ?? [];
            expect(container.querySelector('table')).not.toBeNull();
            for (const item of items) {
                const anchor = [...container.querySelectorAll('a')].find(
                    (candidate) =>
                        candidate.getAttribute('href') === item.href &&
                        candidate.textContent === item.label,
                );
                expect(anchor).toBeDefined();
            }
        });
    });

    describe('SetupChecklistCard', () => {
        it('renders the action links and item links for every open step', () => {
            const model = modelOf({ hub: false, withCosts: false });
            render(<SetupChecklistCard model={model} />);
            const hrefs = hrefsOf(container);
            for (const step of model.steps) {
                if (step.status === SetupRowStatus.Missing) {
                    expect(hrefs).toContain(step.href);
                }
                for (const item of [...step.items, ...step.accounts]) {
                    expect(hrefs).toContain(item.href);
                }
            }
            expect(container.textContent).toContain(
                `${String(model.doneCount)} of ${String(model.totalSteps)} steps done`,
            );
        });

        it('shows a failed engine with its reason instead of waiting forever, keeps the link to the expected net and counts only the steps done', () => {
            const failure = 'Web workers are not available in this browser.';
            const model = modelOf({
                expectedValueFailure: failure,
                hub: false,
                withCosts: true,
            });
            const evStep = model.steps.find(
                (step) => step.key === SetupStep.ExpectedValueComputed,
            );
            expect(evStep?.status).toBe(SetupRowStatus.Failed);
            render(<SetupChecklistCard model={model} />);
            expect(container.textContent).toContain(
                'The engine failed: Expected value computed',
            );
            expect(container.textContent).toContain(failure);
            expect(container.textContent).not.toContain(
                'Waiting for the engine',
            );
            expect(hrefsOf(container)).toContain(evStep?.href);
            expect(container.textContent).toContain('4 of 5 steps done');
        });
    });
});
