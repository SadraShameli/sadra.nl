import type * as ReactModule from 'react';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type PayoutStakeView,
    ValueSectionKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import { PayoutReadyBanner } from '~/app/(app)/prop-calculator/accounts/_components/advice/PayoutReadyBanner';
import {
    type RecordedRiskCheck,
    type RiskCheckInputs,
    type RiskCheckView,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/riskCheckModel';
import { RuleViolationKind } from '~/lib/prop-accounts';
import { NextTradeRiskVerdict } from '~/lib/prop-calculator/advisor';

const harness = vi.hoisted(() => ({
    invalidate: vi.fn(() => Promise.resolve()),
    listInputs: [] as unknown[],
    mutate: vi.fn<(input: unknown) => void>(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    violations: {
        isPending: false,
        rows: [] as { decisionId: null | string; kind: string }[],
    },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
    toast: { error: harness.toastError, success: harness.toastSuccess },
}));

vi.mock('~/trpc/react', async () => {
    const { useState } = await vi.importActual<typeof ReactModule>('react');
    return {
        api: {
            propAccounts: {
                violation: {
                    create: {
                        useMutation: (
                            options: { onSuccess?: () => void } = {},
                        ) => {
                            const [variables, setVariables] = useState<null | {
                                decisionId: null | string;
                            }>(null);
                            return {
                                isPending: false,
                                isSuccess: variables !== null,
                                mutate: (input: {
                                    decisionId: null | string;
                                }) => {
                                    harness.mutate(input);
                                    setVariables(input);
                                    options.onSuccess?.();
                                },
                                variables: variables ?? undefined,
                            };
                        },
                    },
                    list: {
                        useQuery: (input: unknown) => {
                            harness.listInputs.push(input);
                            return {
                                data: harness.violations.isPending
                                    ? undefined
                                    : harness.violations.rows,
                                isPending: harness.violations.isPending,
                            };
                        },
                    },
                },
            },
            useUtils: () => ({
                propAccounts: { invalidate: harness.invalidate },
            }),
        },
    };
});

const { ProposedRiskCheck } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/ProposedRiskCheck');

const VIDEO_FIGURES = ['600', '350', '466'];

const EMPTY: RiskCheckInputs = { losses: '', risk: '', wins: '' };

function check(overrides: Partial<RiskCheckView> = {}): RiskCheckView {
    return {
        excess: 0,
        isViolationOffered: false,
        payoutEligibleAboveRung: false,
        stopText: null,
        verdict: NextTradeRiskVerdict.WithinPlan,
        verdictText: 'Within your documented plan.',
        ...overrides,
    };
}

const ABOVE_AFTER_LOSS = check({
    excess: 125,
    isViolationOffered: true,
    verdict: NextTradeRiskVerdict.AboveDocumented,
    verdictText: 'Above the documented rung of $250.00 by $125.00.',
});

function recordedOf(
    view: RiskCheckView,
    overrides: Partial<RecordedRiskCheck> = {},
): RecordedRiskCheck {
    return {
        basisText: 'Judged against 0 wins and 1 loss entered above.',
        decisionId: 'decision-7',
        risk: 375,
        view,
        ...overrides,
    };
}

const STAKE: PayoutStakeView = {
    continueNow: { standardError: 10, value: 1000 },
    evAtStake: { standardError: 14, value: 300 },
    requestedAmount: 500,
    requestNow: { standardError: 9, value: 1300 },
    traderReceivesNow: 450,
    whatIf: {
        label: 'what-if: your documented rung is unchanged (QV-18)',
        risk: 125,
        value: { standardError: 11, value: 900 },
    },
};

describe('ProposedRiskCheck and PayoutReadyBanner (PT-67)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.mutate.mockClear();
        harness.listInputs.length = 0;
        harness.violations.isPending = false;
        harness.violations.rows = [];
        harness.invalidate.mockClear();
        harness.toastError.mockClear();
        harness.toastSuccess.mockClear();
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

    function renderCheck(
        props: Partial<React.ComponentProps<typeof ProposedRiskCheck>> = {},
    ) {
        const onChange = vi.fn();
        act(() => {
            root.render(
                <ProposedRiskCheck
                    accountId="account-a"
                    check={null}
                    inputMessage={null}
                    inputs={EMPTY}
                    notRunReason={null}
                    occurredOn="2026-09-27"
                    onChange={onChange}
                    recorded={null}
                    {...props}
                />,
            );
        });
        return onChange;
    }

    function setInput(label: string, text: string) {
        const input = container.querySelector<HTMLInputElement>(
            `input[aria-label="${CSS.escape(label)}"]`,
        );
        if (input === null) throw new Error(`no input labelled ${label}`);
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        );
        act(() => {
            descriptor?.set?.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function button(name: string): HTMLButtonElement | null {
        return (
            [...container.querySelectorAll('button')].find(
                (candidate) => candidate.textContent === name,
            ) ?? null
        );
    }

    function renderBanner(
        props: Partial<React.ComponentProps<typeof PayoutReadyBanner>> = {},
    ) {
        act(() => {
            root.render(
                <PayoutReadyBanner
                    flag={null}
                    stake={{ kind: ValueSectionKind.Ready, view: STAKE }}
                    {...props}
                />,
            );
        });
    }

    describe('ProposedRiskCheck', () => {
        it('has a risk field and optional wins and losses fields', () => {
            renderCheck();

            expect(
                container.querySelector(
                    'input[aria-label="Proposed risk ($)"]',
                ),
            ).not.toBeNull();
            expect(
                container.querySelector('input[aria-label="Wins today"]'),
            ).not.toBeNull();
            expect(
                container.querySelector('input[aria-label="Losses today"]'),
            ).not.toBeNull();
        });

        it('reports each edit through onChange with the other fields kept', () => {
            const onChange = renderCheck({
                inputs: { losses: '1', risk: '', wins: '' },
            });

            setInput('Proposed risk ($)', '300');

            expect(onChange).toHaveBeenCalledWith({
                losses: '1',
                risk: '300',
                wins: '',
            });
        });

        it('shows nothing about a verdict until a risk is entered', () => {
            renderCheck();

            expect(container.querySelector('[role="status"]')).toBeNull();
        });

        it('shows the within-plan verdict and never offers the violation log', () => {
            renderCheck({
                check: check(),
                inputs: { losses: '2', risk: '250', wins: '' },
            });

            expect(
                container.querySelector('[role="status"]')?.textContent,
            ).toContain('Within your documented plan.');
            expect(button('Log violation')).toBeNull();
        });

        it('shows the excess over the documented rung', () => {
            renderCheck({
                check: ABOVE_AFTER_LOSS,
                inputs: { losses: '1', risk: '375', wins: '' },
            });

            expect(
                container.querySelector('[role="status"]')?.textContent,
            ).toContain('Above the documented rung of $250.00 by $125.00.');
        });

        it('never offers Log violation for a proposed risk, which has not been placed', () => {
            renderCheck({
                check: ABOVE_AFTER_LOSS,
                inputs: { losses: '1', risk: '375', wins: '' },
            });

            expect(
                container.querySelector('[role="status"]')?.textContent,
            ).toContain('Above the documented rung');
            expect(button('Log violation')).toBeNull();
        });

        it('offers Log violation for the recorded actual risk after a loss and records ForcedRecovery with that decision id', () => {
            renderCheck({
                check: check(),
                inputs: { losses: '1', risk: '250', wins: '' },
                recorded: recordedOf(ABOVE_AFTER_LOSS, {
                    decisionId: 'recorded-3',
                }),
            });

            const log = button('Log violation');
            expect(log).not.toBeNull();
            act(() => {
                log?.click();
            });

            expect(harness.mutate).toHaveBeenCalledWith({
                accountId: 'account-a',
                costCents: null,
                decisionId: 'recorded-3',
                kind: RuleViolationKind.ForcedRecovery,
                note: null,
                occurredOn: '2026-09-27',
            });
            expect(harness.toastSuccess).toHaveBeenCalled();
            expect(harness.invalidate).toHaveBeenCalled();
        });

        it('replaces the Log violation button with a recorded state after it is logged, so it cannot be logged twice', () => {
            renderCheck({
                recorded: recordedOf(ABOVE_AFTER_LOSS),
            });

            act(() => {
                button('Log violation')?.click();
            });

            expect(button('Log violation')).toBeNull();
            expect(container.textContent).toContain('Violation recorded');
            expect(harness.mutate).toHaveBeenCalledTimes(1);
        });

        it('reads the violations of the account', () => {
            renderCheck({ recorded: recordedOf(ABOVE_AFTER_LOSS) });

            expect(harness.listInputs).toContainEqual({
                accountId: 'account-a',
            });
        });

        it('shows Violation recorded, never the button, for a decision that already has a violation of that kind, as after a remount', () => {
            harness.violations.rows = [
                {
                    decisionId: 'decision-7',
                    kind: RuleViolationKind.ForcedRecovery,
                },
            ];

            renderCheck({ recorded: recordedOf(ABOVE_AFTER_LOSS) });

            expect(button('Log violation')).toBeNull();
            expect(container.textContent).toContain('Violation recorded');
            expect(harness.mutate).not.toHaveBeenCalled();
        });

        it('still offers the button when the existing violations are of another kind or another decision', () => {
            harness.violations.rows = [
                { decisionId: 'decision-7', kind: RuleViolationKind.Oversize },
                {
                    decisionId: 'decision-8',
                    kind: RuleViolationKind.ForcedRecovery,
                },
                { decisionId: null, kind: RuleViolationKind.ForcedRecovery },
            ];

            renderCheck({ recorded: recordedOf(ABOVE_AFTER_LOSS) });

            expect(button('Log violation')).not.toBeNull();
            expect(container.textContent).not.toContain('Violation recorded');
        });

        it('holds the button back while the violations are still loading, so a second write is never offered on a guess', () => {
            harness.violations.isPending = true;

            renderCheck({ recorded: recordedOf(ABOVE_AFTER_LOSS) });

            expect(button('Log violation')?.disabled).toBe(true);
        });

        it('shows the verdict for the recorded actual risk with the day progress it was judged against', () => {
            renderCheck({
                check: check(),
                inputs: { losses: '1', risk: '250', wins: '' },
                recorded: recordedOf(ABOVE_AFTER_LOSS),
            });

            const text = container.textContent;
            expect(text).toContain('Recorded actual risk $375');
            expect(text).toContain(
                'Judged against 0 wins and 1 loss entered above.',
            );
            expect(text).toContain(
                'Above the documented rung of $250.00 by $125.00.',
            );
        });

        it('never offers Log violation for a recorded risk that is within the plan, even after a loss', () => {
            renderCheck({
                recorded: recordedOf(check()),
            });

            expect(button('Log violation')).toBeNull();
        });

        it('says an input is invalid instead of showing a verdict', () => {
            renderCheck({
                check: null,
                inputMessage: 'Enter a risk above $0.',
                inputs: { losses: '', risk: '-5', wins: '' },
            });

            expect(
                container.querySelector('[role="alert"]')?.textContent,
            ).toContain('Enter a risk above $0.');
            expect(container.querySelector('[role="status"]')).toBeNull();
        });

        it('says why the check did not run when the advice is stale', () => {
            renderCheck({
                inputs: { losses: '', risk: '250', wins: '' },
                notRunReason: 'The advice is stale, so no risk check can run.',
            });

            expect(container.textContent).toContain(
                'The advice is stale, so no risk check can run.',
            );
            expect(button('Log violation')).toBeNull();
        });

        it('says what stopped the day as a lock when the check finds the stop fired', () => {
            renderCheck({
                check: check({
                    excess: 100,
                    isViolationOffered: true,
                    stopText: 'no loss room is left today',
                    verdict: NextTradeRiskVerdict.AboveDocumented,
                    verdictText:
                        'The documented plan has stopped for today (no loss room is left today); this risk is above it by $100.00.',
                }),
                inputs: { losses: '2', risk: '100', wins: '' },
            });

            expect(
                container.querySelector('[role="status"]')?.textContent,
            ).toContain('has stopped for today');
        });
    });

    describe('PayoutReadyBanner', () => {
        it('headlines Request payout and says the documented rungs stay unchanged', () => {
            renderBanner();

            expect(container.querySelector('h3')?.textContent).toBe(
                'Request payout',
            );
            expect(container.textContent).toContain(
                'documented rungs below are unchanged',
            );
        });

        it('states the lesson in one line', () => {
            renderBanner();

            expect(container.textContent).toContain(
                'do not risk the account across several trades for a bigger payout when you can withdraw now',
            );
        });

        it('compares requesting now with continuing as EV at stake', () => {
            renderBanner();

            const text = container.textContent;
            expect(text).toContain('EV at stake');
            expect(text).toContain('Requesting now: $1,300 ± $9');
            expect(text).toContain('Continuing: $1,000 ± $10');
            expect(text).toContain('You receive $450.00 now');
        });

        it('shows the reduced-risk row only as the labelled what-if', () => {
            renderBanner();

            const text = container.textContent;
            expect(text).toContain(
                'what-if: your documented rung is unchanged (QV-18)',
            );
            expect(text).toContain('$900 ± $11');
        });

        it('has no what-if row when none was computed', () => {
            renderBanner({
                stake: {
                    kind: ValueSectionKind.Ready,
                    view: { ...STAKE, whatIf: null },
                },
            });

            expect(container.textContent).not.toContain('what-if');
        });

        it('shows no flag while the risk is within the documented rung', () => {
            renderBanner();

            expect(container.querySelector('[role="alert"]')).toBeNull();
        });

        it('turns into a flag when the proposed or recorded risk is above the documented rung', () => {
            renderBanner({ flag: { excess: 125 } });

            const alert = container.querySelector('[role="alert"]');
            expect(alert?.textContent).toContain('Flag');
            expect(alert?.textContent).toContain('$125.00');
            expect(alert?.textContent).toContain('above the documented rung');
        });

        it('states a failed stake computation instead of hiding it', () => {
            renderBanner({
                stake: {
                    kind: ValueSectionKind.Failed,
                    reason: 'the engine refused',
                },
            });

            expect(container.textContent).toContain(
                'Left out: the engine refused',
            );
        });

        it('shows no EV at stake without a stake computation', () => {
            renderBanner({ stake: null });

            expect(container.textContent).not.toContain('EV at stake');
            expect(container.querySelector('h3')?.textContent).toBe(
                'Request payout',
            );
        });
    });

    describe('what the views never show', () => {
        it('contains none of the video figures in any rendered text', () => {
            act(() => {
                root.render(
                    <>
                        <ProposedRiskCheck
                            accountId="account-a"
                            check={ABOVE_AFTER_LOSS}
                            inputMessage={null}
                            inputs={{ losses: '1', risk: '375', wins: '' }}
                            notRunReason={null}
                            occurredOn="2026-09-27"
                            onChange={vi.fn()}
                            recorded={recordedOf(ABOVE_AFTER_LOSS)}
                        />
                        <PayoutReadyBanner
                            flag={{ excess: 125 }}
                            stake={{
                                kind: ValueSectionKind.Ready,
                                view: STAKE,
                            }}
                        />
                    </>,
                );
            });

            for (const figure of VIDEO_FIGURES) {
                expect(container.textContent).not.toContain(figure);
            }
        });
    });
});
