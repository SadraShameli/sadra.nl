import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PositionSizeView } from '~/app/(app)/prop-calculator/(tools)/position-size/PositionSizeView';
import { PositionSizeUrlParameter } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    DEFAULT_RULEBOOK,
    RiskDisplayUnit,
} from '~/lib/prop-calculator/advisor';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
} from '~/lib/prop-calculator/economics';

const harness = vi.hoisted(() => ({
    query: '',
    rulebook: undefined as undefined | { display: { riskUnit: string } },
    session: null as null | { user: { id: string } },
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.session,
        error: null,
        isPending: false,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: { useQuery: () => ({ data: harness.rulebook }) },
            },
        },
    },
}));

const NEAR_FRESH_EVAL_TEXT =
    ECONOMICS_DISCLOSURE_TEXT[EconomicsDisclosure.NearFreshEvalApproximation];
const EV_AT_STAKE_NOTE = 'EV at stake needs an account; see the account pages';

function savedRulebook(riskUnit: RiskDisplayUnit) {
    return {
        ...DEFAULT_RULEBOOK,
        display: { ...DEFAULT_RULEBOOK.display, riskUnit },
    };
}

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(harness.query),
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: ({ ownQuery }: { ownQuery: string }) => (
        <div className="own-query-under-test" data-own-query={ownQuery} />
    ),
}));

vi.mock('~/app/(app)/prop-calculator/_components/FirmPlanPicker', () => ({
    default: ({
        firms,
        onPlanChange,
        plan,
    }: {
        firms: readonly { plans: readonly { retryFee: () => number }[] }[];
        onPlanChange: (plan: { retryFee: () => number }) => void;
        plan: { retryFee: () => number };
    }) => {
        const other = firms
            .flatMap((firm) => firm.plans)
            .find((candidate) => candidate.retryFee() !== plan.retryFee());
        return (
            <button
                data-testid="switch-plan"
                onClick={() => other !== undefined && onPlanChange(other)}
                type="button"
            >
                switch-plan
            </button>
        );
    },
}));

beforeEach(() => {
    harness.rulebook = undefined;
    harness.session = null;
});

const FIX_TEXT = 'Fix the highlighted field to see the position.';

function statCardLabelSpan(
    scope: ParentNode,
    label: string,
): Element | undefined {
    return [...scope.querySelectorAll('span')].find(
        (candidate) => candidate.textContent === label,
    );
}

function statCardSub(scope: ParentNode, label: string): string {
    return (
        statCardLabelSpan(scope, label)?.nextElementSibling?.nextElementSibling
            ?.textContent ?? ''
    );
}

function statCardValue(scope: ParentNode, label: string): string {
    return (
        statCardLabelSpan(scope, label)?.nextElementSibling?.textContent ?? ''
    );
}

function typeInto(input: HTMLInputElement, text: string) {
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', text, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('PositionSizeView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function field(id: string): HTMLInputElement {
        const element = container.querySelector(`#${id}`);
        if (!(element instanceof HTMLInputElement)) {
            throw new TypeError(`no input #${id}`);
        }
        return element;
    }

    function ownQuery(): URLSearchParams {
        const heading = container.querySelector('.own-query-under-test');
        return new URLSearchParams(
            heading instanceof HTMLElement
                ? (heading.dataset.ownQuery ?? '')
                : '',
        );
    }

    function positionSection(): HTMLElement {
        const section = container.querySelector(
            'section[aria-labelledby="position-size-result-heading"]',
        );
        if (!(section instanceof HTMLElement)) {
            throw new TypeError('no position section');
        }
        return section;
    }

    function status(): string {
        return container.querySelector('[role="status"]')?.textContent ?? '';
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.query = `${PositionSizeUrlParameter.Risk}=475&${PositionSizeUrlParameter.Stop}=7.5`;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<PositionSizeView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows the position for the entered risk and stop', () => {
        const text = positionSection().textContent;
        expect(text).toContain('3 NQ');
        expect(text).toContain('$25');
        expect(text).not.toContain(FIX_TEXT);
        expect(ownQuery().get(PositionSizeUrlParameter.Risk)).toBe('475');
    });

    it('shows no contract count or leftover while the risk field is empty, and leaves the risk out of the share link', () => {
        typeInto(field('position-size-risk'), '');
        const text = positionSection().textContent;
        expect(text).toContain(FIX_TEXT);
        expect(text).not.toContain('3 NQ');
        expect(text).not.toContain('$25');
        expect(text).toContain(NOT_APPLICABLE);
        expect(ownQuery().has(PositionSizeUrlParameter.Risk)).toBe(false);
        expect(ownQuery().get(PositionSizeUrlParameter.Stop)).toBe('7.5');
        expect(status()).toBe(FIX_TEXT);
    });

    it('shows no stale position while the stop is below the tick, and recovers on a valid stop', () => {
        typeInto(field('position-size-stop'), '0.1');
        expect(positionSection().textContent).toContain(FIX_TEXT);
        expect(positionSection().textContent).not.toContain('3 NQ');
        expect(ownQuery().has(PositionSizeUrlParameter.Stop)).toBe(false);
        typeInto(field('position-size-stop'), '5');
        const text = positionSection().textContent;
        expect(text).not.toContain(FIX_TEXT);
        expect(ownQuery().get(PositionSizeUrlParameter.Stop)).toBe('5');
    });

    it('announces one summary sentence through a status region, not the whole section', () => {
        expect(positionSection().hasAttribute('aria-live')).toBe(false);
        expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
        expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
        expect(status()).toBe(
            '3 NQ, $25 left over; the stop for the exact risk is 7.75 points, risking $465.',
        );
    });

    it('shows the retry fee field and an at-risk-if-busted line in the eval phase', () => {
        const retryFeeField = field('position-size-retry-fee');
        expect(retryFeeField.value).not.toBe('');
        expect(positionSection().textContent).toContain('At risk if busted');
        typeInto(retryFeeField, '600');
        expect(positionSection().textContent).toContain('$600');
        expect(ownQuery().get(PositionSizeUrlParameter.RetryFee)).toBe('600');
    });

    it('resyncs the displayed retry fee after switching plans', () => {
        const before = field('position-size-retry-fee').value;
        act(() => {
            container
                .querySelector('[data-testid="switch-plan"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const after = field('position-size-retry-fee').value;
        expect(after).not.toBe('');
        expect(after).not.toBe(before);
        expect(after).toBe(ownQuery().get(PositionSizeUrlParameter.RetryFee));
    });
});

describe('PositionSizeView in the funded phase', () => {
    let container: HTMLDivElement;
    let root: Root;

    function positionSection(): HTMLElement {
        const section = container.querySelector(
            'section[aria-labelledby="position-size-result-heading"]',
        );
        if (!(section instanceof HTMLElement)) {
            throw new TypeError('no position section');
        }
        return section;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.query = `${PositionSizeUrlParameter.Phase}=funded&${PositionSizeUrlParameter.Risk}=475&${PositionSizeUrlParameter.Stop}=7.5`;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<PositionSizeView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('hides the retry fee field and the at-risk-if-busted line, the fee-equivalent heuristic is eval-only', () => {
        expect(container.querySelector('#position-size-retry-fee')).toBeNull();
        expect(positionSection().textContent).not.toContain(
            'At risk if busted',
        );
    });
});

describe('PositionSizeView sibling instrument mismatch', () => {
    let container: HTMLDivElement;
    let root: Root;

    function positionSection(): HTMLElement {
        const section = container.querySelector(
            'section[aria-labelledby="position-size-result-heading"]',
        );
        if (!(section instanceof HTMLElement)) {
            throw new TypeError('no position section');
        }
        return section;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.query = `${PositionSizeUrlParameter.Instrument}=MNQ&${PositionSizeUrlParameter.Risk}=150&${PositionSizeUrlParameter.Stop}=7.5`;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<PositionSizeView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('names the sibling instrument, its risk and the mismatch severity', () => {
        const text = positionSection().textContent;
        expect(text).toContain('NQ');
        expect(text).toContain('$1,500');
        expect(text).toContain('more than you intended');
    });
});

describe('PositionSizeView risk display unit', () => {
    let container: HTMLDivElement;
    let root: Root;

    function positionSection(): HTMLElement {
        const section = container.querySelector(
            'section[aria-labelledby="position-size-result-heading"]',
        );
        if (!(section instanceof HTMLElement)) {
            throw new TypeError('no position section');
        }
        return section;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.query = `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5&${PositionSizeUrlParameter.Unit}=fee-equivalent`;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<PositionSizeView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows the risk in the fee-equivalent unit chosen through the URL', () => {
        expect(statCardValue(positionSection(), 'Risk, shown as')).not.toBe(
            '$450',
        );
        expect(statCardSub(positionSection(), 'Risk, shown as')).toBe(
            'Fee equivalent',
        );
    });
});

describe('PositionSizeView fee-equivalent label, saved unit and room left (PT-92)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function positionSection(): HTMLElement {
        const section = container.querySelector(
            'section[aria-labelledby="position-size-result-heading"]',
        );
        if (!(section instanceof HTMLElement)) {
            throw new TypeError('no position section');
        }
        return section;
    }

    function ownQuery(): URLSearchParams {
        const heading = container.querySelector('.own-query-under-test');
        return new URLSearchParams(
            heading instanceof HTMLElement
                ? (heading.dataset.ownQuery ?? '')
                : '',
        );
    }

    function renderWith(query: string) {
        harness.query = query;
        act(() => {
            root.render(<PositionSizeView />);
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

    it('prints the near-fresh-eval label on the card whenever a fee-equivalent figure shows', () => {
        renderWith(
            `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5&${PositionSizeUrlParameter.Unit}=fee-equivalent`,
        );

        expect(positionSection().textContent).toContain(NEAR_FRESH_EVAL_TEXT);
    });

    it('prints no approximation label for account dollars', () => {
        renderWith(
            `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5&${PositionSizeUrlParameter.Unit}=account-dollars`,
        );

        expect(positionSection().textContent).not.toContain(
            NEAR_FRESH_EVAL_TEXT,
        );
    });

    it('starts a signed-in user without a URL unit on the saved risk unit', () => {
        harness.session = { user: { id: 'user-1' } };
        harness.rulebook = savedRulebook(RiskDisplayUnit.FeeEquivalent);
        renderWith(
            `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5`,
        );

        const text = positionSection().textContent;
        expect(text).toContain('Fee equivalent');
        expect(text).toContain(NEAR_FRESH_EVAL_TEXT);
        expect(ownQuery().has(PositionSizeUrlParameter.Unit)).toBe(false);
    });

    it('falls back to the fee equivalent with a note when the saved unit is EV at stake', () => {
        harness.session = { user: { id: 'user-1' } };
        harness.rulebook = savedRulebook(RiskDisplayUnit.EvAtStake);
        renderWith(
            `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5`,
        );

        const text = positionSection().textContent;
        expect(text).toContain('Fee equivalent (EV at stake unavailable)');
        expect(text).toContain(EV_AT_STAKE_NOTE);
    });

    it('lets the URL unit win over the saved unit', () => {
        harness.session = { user: { id: 'user-1' } };
        harness.rulebook = savedRulebook(RiskDisplayUnit.FeeEquivalent);
        renderWith(
            `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5&${PositionSizeUrlParameter.Unit}=account-dollars`,
        );

        const text = positionSection().textContent;
        expect(text).toContain('Account dollars');
        expect(text).not.toContain(NEAR_FRESH_EVAL_TEXT);
        expect(ownQuery().get(PositionSizeUrlParameter.Unit)).toBe(
            'account-dollars',
        );
    });

    it('ignores a saved unit when nobody is signed in', () => {
        harness.rulebook = savedRulebook(RiskDisplayUnit.FeeEquivalent);
        renderWith(
            `${PositionSizeUrlParameter.Risk}=450&${PositionSizeUrlParameter.Stop}=7.5`,
        );

        expect(positionSection().textContent).not.toContain(
            NEAR_FRESH_EVAL_TEXT,
        );
    });

    it('judges the sibling mismatch against a typed room left today and shares it', () => {
        renderWith(
            `${PositionSizeUrlParameter.Instrument}=MNQ&${PositionSizeUrlParameter.Risk}=150&${PositionSizeUrlParameter.Stop}=7.5`,
        );
        expect(positionSection().textContent).not.toContain('room left today');
        const room = container.querySelector('#position-size-room');
        if (!(room instanceof HTMLInputElement)) {
            throw new TypeError('no room field');
        }
        expect(
            container.querySelector('label[for="position-size-room"]')
                ?.textContent,
        ).toBe('Room left today (cushion or daily loss limit)');
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', '300', room);
            room.dispatchEvent(new Event('input', { bubbles: true }));
        });

        expect(positionSection().textContent).toContain('room left today');
        expect(ownQuery().get(PositionSizeUrlParameter.Room)).toBe('300');
    });

    it('accepts a spent room of zero, judges against it and shares it', () => {
        renderWith(
            `${PositionSizeUrlParameter.Instrument}=MNQ&${PositionSizeUrlParameter.Risk}=150&${PositionSizeUrlParameter.Stop}=7.5`,
        );
        const room = container.querySelector('#position-size-room');
        if (!(room instanceof HTMLInputElement)) {
            throw new TypeError('no room field');
        }
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', '0', room);
            room.dispatchEvent(new Event('input', { bubbles: true }));
        });

        expect(positionSection().textContent).toContain('room left today');
        expect(ownQuery().get(PositionSizeUrlParameter.Room)).toBe('0');
    });
});
