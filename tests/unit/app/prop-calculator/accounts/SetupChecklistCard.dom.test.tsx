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
import { BankrollTransferKind, FeeKind } from '~/lib/prop-accounts/core';
import {
    setupChecklistOf,
    SetupStep,
    SetupStepStatus,
} from '~/lib/prop-accounts/metrics';
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
                    candidate.status === SetupStepStatus.Missing ||
                    candidate.status === SetupStepStatus.NotChecked,
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

        it('links each missing item to its fix, as the overview card does', () => {
            const model = modelOf({ hub: true, withCosts: false });
            const costs = model.steps.find(
                (step) => step.key === SetupStep.CostsEntered,
            );
            expect(costs?.items.length).toBeGreaterThan(0);
            render(<SetupChecklistCompact model={model} />);
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
    });

    describe('SetupChecklistCard', () => {
        it('renders the action links and item links for every open step', () => {
            const model = modelOf({ hub: false, withCosts: false });
            render(<SetupChecklistCard model={model} />);
            const hrefs = hrefsOf(container);
            for (const step of model.steps) {
                if (step.status === SetupStepStatus.Missing) {
                    expect(hrefs).toContain(step.href);
                }
                for (const item of step.items) {
                    expect(hrefs).toContain(item.href);
                }
            }
            expect(container.textContent).toContain(
                `${String(model.doneCount)} of ${String(model.totalSteps)} steps done`,
            );
        });
    });
});
