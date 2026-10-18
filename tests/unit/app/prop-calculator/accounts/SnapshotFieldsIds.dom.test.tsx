import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    emptySnapshotFormValues,
    type SnapshotFieldIssue,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { SnapshotFields } from '~/app/(app)/prop-calculator/accounts/_components/SnapshotFields';
import {
    AccountStage,
    SnapshotField,
    snapshotFieldRules,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, type Plan } from '~/lib/prop-calculator';

const AS_OF = '2026-09-21';
const FIRST_ID = 'a1111111-1111-4111-8111-111111111111';
const SECOND_ID = 'a2222222-2222-4222-8222-222222222222';

function anyEvalPlan(): Plan {
    const plan = ALL_FIRMS.flatMap((firm) => firm.plans).find(
        (candidate) => !candidate.isInstantFunded,
    );
    if (plan === undefined) throw new Error('no eval plan in the registry');
    return plan;
}

function card(
    id: string,
    issues: readonly SnapshotFieldIssue[],
    warnings: readonly SnapshotFieldIssue[],
) {
    return (
        <section data-testid={id} key={id}>
            <SnapshotFields
                fieldWarnings={warnings}
                formIssues={[]}
                formWarnings={[]}
                idPrefix={id}
                issues={issues}
                onChange={vi.fn()}
                rules={snapshotFieldRules(anyEvalPlan(), AccountStage.Eval)}
                values={emptySnapshotFormValues(AS_OF)}
            />
        </section>
    );
}

describe('SnapshotFields ids inside one page', () => {
    let container: HTMLDivElement;
    let root: Root;

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

    function renderTwoCards() {
        const issue = { field: SnapshotField.Balance, message: 'too low' };
        const warning = {
            field: SnapshotField.TradingDays,
            message: 'check this',
        };
        act(() => {
            root.render(
                <>
                    {card(FIRST_ID, [issue], [warning])}
                    {card(SECOND_ID, [issue], [warning])}
                </>,
            );
        });
    }

    function cardElement(id: string): HTMLElement {
        const element = container.querySelector<HTMLElement>(
            `[data-testid="${CSS.escape(id)}"]`,
        );
        if (element === null) throw new Error(`no card ${id}`);
        return element;
    }

    it('gives no id twice when two account cards sit on one page', () => {
        renderTwoCards();
        const ids = [...container.querySelectorAll('[id]')].map(
            (element) => element.id,
        );
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('points every label at the input of its own card', () => {
        renderTwoCards();
        for (const id of [FIRST_ID, SECOND_ID]) {
            const scope = cardElement(id);
            const labels = [...scope.querySelectorAll('label')];
            expect(labels.length).toBeGreaterThan(0);
            for (const label of labels) {
                const control = label.control;
                expect(control).not.toBeNull();
                expect(scope.contains(control)).toBe(true);
            }
        }
    });

    it('describes every input with the hint, error and warning of its own card', () => {
        renderTwoCards();
        for (const id of [FIRST_ID, SECOND_ID]) {
            const scope = cardElement(id);
            const described = [
                ...scope.querySelectorAll('input[aria-describedby]'),
            ];
            expect(described.length).toBeGreaterThan(0);
            for (const input of described) {
                const references = (
                    input.getAttribute('aria-describedby') ?? ''
                ).split(' ');
                for (const reference of references) {
                    expect(
                        scope.querySelector(`[id="${CSS.escape(reference)}"]`),
                    ).not.toBeNull();
                }
            }
        }
    });

    it('keeps the unprefixed ids for a form that has one snapshot on the page', () => {
        act(() => {
            root.render(
                <SnapshotFields
                    fieldWarnings={[]}
                    formIssues={[]}
                    formWarnings={[]}
                    issues={[]}
                    onChange={vi.fn()}
                    rules={snapshotFieldRules(anyEvalPlan(), AccountStage.Eval)}
                    values={emptySnapshotFormValues(AS_OF)}
                />,
            );
        });
        expect(
            container.querySelector(`#snapshot-${SnapshotField.Balance}`),
        ).not.toBeNull();
    });

    it('does not call onChange for a read-only field', () => {
        const onChange = vi.fn();
        act(() => {
            root.render(
                <SnapshotFields
                    fieldWarnings={[]}
                    formIssues={[]}
                    formWarnings={[]}
                    idPrefix={FIRST_ID}
                    isReadOnly
                    issues={[]}
                    onChange={onChange}
                    rules={snapshotFieldRules(anyEvalPlan(), AccountStage.Eval)}
                    values={emptySnapshotFormValues(AS_OF)}
                />,
            );
        });
        const input = container.querySelector<HTMLInputElement>(
            `#snapshot-${FIRST_ID}-${SnapshotField.Balance}`,
        );
        if (input === null) throw new Error('no balance input');
        expect(input.readOnly).toBe(true);
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', '123', input);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(onChange).not.toHaveBeenCalled();
    });
});
