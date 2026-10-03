import { readFileSync } from 'node:fs';
import path from 'node:path';
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

import type {
    BankrollPlanVariantInputs,
    ToolsWorkerRequest,
    ToolsWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';

import { RulebookSource } from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import { type ObjectiveChoice } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import {
    type CalculatorAction,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import CopySplitSection from '~/app/(app)/prop-calculator/_components/CopySplitSection';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { DayStopRuleKind, FirmId } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    CopySplitFundedSource,
    CopySplitRowKind,
} from '~/lib/prop-calculator/advisor/policy';

interface SectionHarness {
    buildRequest: ((runId: number) => null | ToolsWorkerRequest) | null;
    choice: ObjectiveChoice;
    dispatch: Mock<(action: CalculatorAction) => void>;
    objective: null | SizingObjective;
    phase: null | ToolsWorkerPhase;
    requestKey: null | string;
    result: null | ToolsWorkerResult;
    rulebook: null | RulebookParameters;
    rulebookSource: null | RulebookSource;
}

const harness = vi.hoisted((): SectionHarness => ({
    buildRequest: null,
    choice: { automaticBasis: null, queryFailure: null },
    dispatch: vi.fn(),
    objective: null,
    phase: null,
    requestKey: null,
    result: null,
    rulebook: null,
    rulebookSource: null,
}));

const VARIANT: BankrollPlanVariantInputs = {
    base: {
        fundedHorizonDays: 30,
        maxEvalDays: 30,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 500,
        winrate: 0.4,
    },
    plan: {
        firmId: FirmId.TopStep,
        optIns: {
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        },
        planSerial: 'topstep-50000-standard-standard',
    },
    policy: {
        commissionPerRoundTrip: 0,
        fundedHorizonDays: 30,
        lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        lifetimePayoutCapOverride: null,
        payoutRequestOverride: 500,
        rebuyLagBasis: RebuyLagBasis.AssumedZero,
        rebuyLagDays: 0,
        retainedCushionRequest: 2000,
    },
};

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({ dispatch: harness.dispatch }),
    useCalculatorInputs: () => ({
        state: {
            ...defaultCalculatorState(),
            copyAccounts: 1,
            objective: harness.objective ?? SizingObjective.MonthlyNet,
        },
    }),
    useObjectiveChoice: () => harness.choice,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant',
    () => ({
        useBankrollVariant: () => ({
            rulebook: harness.rulebook ?? DEFAULT_RULEBOOK,
            rulebookSource:
                harness.rulebookSource ?? RulebookSource.DefaultSignedOut,
            variant: VARIANT,
        }),
    }),
);

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest',
    () => ({
        useToolsRequest: (
            requestKey: null | string,
            buildRequest: (runId: number) => null | ToolsWorkerRequest,
        ) => {
            harness.requestKey = requestKey;
            harness.buildRequest = buildRequest;
            return {
                cancel: vi.fn(),
                run: vi.fn(),
                state:
                    harness.phase === ToolsWorkerPhase.Running
                        ? { phase: ToolsWorkerPhase.Running }
                        : harness.result === null
                          ? { phase: ToolsWorkerPhase.Idle }
                          : {
                                phase: ToolsWorkerPhase.Succeeded,
                                result: harness.result,
                            },
            };
        },
    }),
);

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => ({ useDebouncedValue: <T,>(value: T) => value }),
);

function succeeded(
    overrides: Partial<{
        note: null | string;
        objective: SizingObjective;
        requestedObjective: SizingObjective;
    }> = {},
): ToolsWorkerResult {
    return {
        kind: ToolsResponseKind.CopySplit,
        result: {
            basisLines: [
                'funded risk $250 per account, the Hard Rule 5 fixed amount, not divided by the split',
                'the copies are engine copies that take identical trades, so they win and bust together',
            ],
            indistinguishableSplits: [1],
            note: null,
            objective: SizingObjective.MonthlyNet,
            requestedObjective: SizingObjective.MonthlyNet,
            rows: [
                {
                    cycleNet: { standardError: 20, value: 150 },
                    daysToPassP50: 8,
                    kind: CopySplitRowKind.Simulated,
                    netPerFeeDollar: 1.5,
                    passRate: 0.4,
                    placement: null,
                    riskPerAccount: 1000,
                    splitCount: 2,
                    totalFees: 100,
                    totalMonthlyNet: { standardError: 15, value: 300 },
                    trials: 150,
                },
                {
                    cycleNet: { standardError: 20, value: 140 },
                    daysToPassP50: 9,
                    kind: CopySplitRowKind.Simulated,
                    netPerFeeDollar: 1.4,
                    passRate: 0.3,
                    placement: null,
                    riskPerAccount: 2000,
                    splitCount: 1,
                    totalFees: 100,
                    totalMonthlyNet: { standardError: 15, value: 290 },
                    trials: 150,
                },
                {
                    kind: CopySplitRowKind.Refused,
                    reason: 'risk per account $200 is below one NQ contract',
                    riskPerAccount: 200,
                    splitCount: 10,
                },
            ],
            trialsPerSplit: 150,
            ...overrides,
        },
        runId: 1,
    };
}

function typeInto(input: HTMLInputElement | null, value: string) {
    if (input === null) throw new Error('input missing');
    const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
    );
    act(() => {
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('CopySplitSection (PT-63, F-V24, VD-24)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<CopySplitSection />);
        });
    }

    function labelledInput(labelStart: string): HTMLInputElement | null {
        const label = [...container.querySelectorAll('label')].find((entry) =>
            entry.textContent.startsWith(labelStart),
        );
        return container.querySelector<HTMLInputElement>(
            `input[id="${CSS.escape(label?.htmlFor ?? '')}"]`,
        );
    }

    function fundedRiskInput(): HTMLInputElement | null {
        return labelledInput('Funded risk');
    }

    function describedAlert(input: HTMLInputElement | null): string {
        const id = input?.getAttribute('aria-describedby') ?? '';
        return (
            container.querySelector(`[id="${CSS.escape(id)}"]`)?.textContent ??
            ''
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.dispatch.mockReset();
        harness.choice = { automaticBasis: null, queryFailure: null };
        harness.objective = SizingObjective.MonthlyNet;
        harness.result = null;
        harness.rulebook = null;
        harness.rulebookSource = RulebookSource.DefaultSignedOut;
        harness.phase = null;
        harness.requestKey = null;
        harness.buildRequest = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('asks the tools worker for a CopySplit request carrying the active objective', () => {
        harness.objective = SizingObjective.CycleCash;
        render();
        const request = harness.buildRequest?.(7);
        expect(request?.kind).toBe(ToolsRequestKind.CopySplit);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.objective).toBe(SizingObjective.CycleCash);
        expect(request.splits).toStrictEqual([1, 2, 5, 10]);
        expect(request.totalRisk).toBe(250);
        expect(request.variant).toStrictEqual({
            ...VARIANT,
            base: { ...VARIANT.base, fundedRiskPerTrade: 250 },
        });
        expect(request.runId).toBe(7);
    });

    it('prices the funded phase at the signed-in rulebook funded risk, shown in a funded risk input', () => {
        harness.rulebook = {
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 40_000 },
        };
        render();
        expect(fundedRiskInput()?.value).toBe('400');
        const request = harness.buildRequest?.(1);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.variant.base.fundedRiskPerTrade).toBe(400);
    });

    it('sends the funded risk the trader types, and an invalid one sends nothing and says why', () => {
        render();
        typeInto(fundedRiskInput(), '800');
        const request = harness.buildRequest?.(2);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.variant.base.fundedRiskPerTrade).toBe(800);
        typeInto(fundedRiskInput(), 'abc');
        expect(harness.requestKey).toBeNull();
        expect(container.textContent).toContain(
            'funded risk must be a positive dollar amount',
        );
    });

    it('sends the signed-in rulebook funded sizing to the worker and shows no stopgap warning', () => {
        harness.rulebookSource = RulebookSource.User;
        harness.rulebook = {
            ...DEFAULT_RULEBOOK,
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
            },
        };
        render();
        const request = harness.buildRequest?.(4);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.funded).toStrictEqual({
            parameters: harness.rulebook.funded,
            source: CopySplitFundedSource.UserRulebook,
        });
        expect(container.textContent).not.toContain(
            'is not applied to this split yet',
        );
    });

    it('never says this page ranks by ruin first when the bankroll chose ruin first automatically', () => {
        harness.objective = SizingObjective.RuinFirst;
        harness.choice = {
            automaticBasis: { availableCents: 100_000, switchCents: 500_000 },
            queryFailure: null,
        };
        render();
        const text = container.textContent;
        expect(text).toContain('Chosen automatically');
        expect(text).toContain('which plan to buy');
        expect(text).toContain("this page's sizing stays on monthly net");
        expect(text).not.toMatch(/page ranks by ruin first/i);
    });

    it('names the default rulebook as the funded sizing source for a signed-out visitor', () => {
        render();
        const request = harness.buildRequest?.(5);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.funded).toStrictEqual({
            parameters: DEFAULT_RULEBOOK.funded,
            source: CopySplitFundedSource.DefaultRulebook,
        });
    });

    it('names the user rulebook as the source even when it is the very object of the default rulebook', () => {
        harness.rulebookSource = RulebookSource.User;
        harness.rulebook = DEFAULT_RULEBOOK;
        render();
        const request = harness.buildRequest?.(6);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.funded.source).toBe(CopySplitFundedSource.UserRulebook);
        expect(container.textContent).not.toContain('could not be loaded');
    });

    it('names the default rulebook as the source for a copy of it when the signed-in query failed, and says the rulebook failed to load', () => {
        harness.rulebookSource = RulebookSource.DefaultFailed;
        harness.rulebook = structuredClone(DEFAULT_RULEBOOK);
        render();
        const request = harness.buildRequest?.(7);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.funded.source).toBe(
            CopySplitFundedSource.DefaultRulebook,
        );
        const alert = [...container.querySelectorAll('[role="alert"]')].find(
            (entry) =>
                entry.textContent.includes('Your rulebook could not be loaded'),
        );
        expect(alert?.textContent).toContain('default rulebook');
    });

    it('says the rulebook is still loading and runs on the default rulebook meanwhile', () => {
        harness.rulebookSource = RulebookSource.DefaultLoading;
        harness.rulebook = structuredClone(DEFAULT_RULEBOOK);
        render();
        const request = harness.buildRequest?.(8);
        if (request?.kind !== ToolsRequestKind.CopySplit) {
            throw new Error('expected a CopySplit request');
        }
        expect(request.funded.source).toBe(
            CopySplitFundedSource.DefaultRulebook,
        );
        expect(container.textContent).toContain('Loading your rulebook');
    });

    it('says nothing about a rulebook load for a signed-out visitor', () => {
        render();
        expect(container.textContent).not.toContain('could not be loaded');
        expect(container.textContent).not.toContain('Loading your rulebook');
    });

    it('ties each invalid input to its alert and marks only the failing input invalid', () => {
        render();
        const total = labelledInput('Total risk');
        const splits = labelledInput('Splits');
        const funded = fundedRiskInput();
        expect(total?.getAttribute('aria-invalid')).toBeNull();
        expect(splits?.getAttribute('aria-invalid')).toBeNull();
        expect(funded?.getAttribute('aria-invalid')).toBeNull();
        typeInto(splits, '2,2');
        expect(splits?.getAttribute('aria-invalid')).toBe('true');
        expect(total?.getAttribute('aria-invalid')).toBeNull();
        expect(describedAlert(splits)).toContain(
            'a split appears more than once',
        );
        typeInto(total, 'abc');
        expect(total?.getAttribute('aria-invalid')).toBe('true');
        expect(describedAlert(total)).toContain(
            'total risk must be a positive dollar amount',
        );
        typeInto(fundedRiskInput(), 'abc');
        expect(fundedRiskInput()?.getAttribute('aria-invalid')).toBe('true');
        expect(describedAlert(fundedRiskInput())).toContain(
            'funded risk must be a positive dollar amount',
        );
    });

    it('sends no request while the inputs are invalid and says why', () => {
        render();
        const label = [...container.querySelectorAll('label')].find((entry) =>
            entry.textContent.startsWith('Splits'),
        );
        const splits = container.querySelector<HTMLInputElement>(
            `input[id="${CSS.escape(label?.htmlFor ?? '')}"]`,
        );
        if (splits === null) throw new Error('splits input missing');
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        );
        act(() => {
            descriptor?.set?.call(splits, '2,2');
            splits.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(harness.requestKey).toBeNull();
        expect(container.textContent).toContain(
            'a split appears more than once',
        );
    });

    it('names the objective in the header and shows the whole-group figures per split', () => {
        harness.result = succeeded();
        render();
        const text = container.textContent;
        expect(text).toContain('Split vs concentrate, objective: monthly net');
        expect(text).toContain('2 accounts at $1,000');
        expect(text).toContain('$300 (SE $15)');
        expect(text).toContain('$150 (SE $20)');
        expect(text).toContain('150 trials per split');
        expect(text).toContain('below one NQ contract');
    });

    it('shows the basis lines, the funded risk used and the correlation of the copies', () => {
        harness.result = succeeded();
        render();
        const text = container.textContent;
        expect(text).toContain('funded risk $250 per account');
        expect(text).toContain('identical trades');
    });

    it('marks a row within noise and explains the mark', () => {
        harness.result = succeeded();
        render();
        const rows = [...container.querySelectorAll(':scope tbody tr')];
        const single = rows.find((row) =>
            row.textContent.startsWith('1 account at $2,000'),
        );
        expect(single?.textContent).toContain('within noise');
        const two = rows.find((row) =>
            row.textContent.startsWith('2 accounts at $1,000'),
        );
        expect(two?.textContent).not.toContain('within noise');
        expect(container.textContent).toContain('combined standard errors');
    });

    it('says it is computing while the worker runs, in a status region', () => {
        harness.phase = ToolsWorkerPhase.Running;
        render();
        const status = container.querySelector('[role="status"]');
        expect(status?.textContent).toContain('Computing');
    });

    it('shows no computing status when idle', () => {
        render();
        expect(container.querySelector('[role="status"]')).toBeNull();
    });

    it('hides a stale result and header while the inputs are invalid', () => {
        harness.result = succeeded();
        render();
        expect(container.textContent).toContain('2 accounts at $1,000');
        const label = [...container.querySelectorAll('label')].find((entry) =>
            entry.textContent.startsWith('Splits'),
        );
        const splits = container.querySelector<HTMLInputElement>(
            `input[id="${CSS.escape(label?.htmlFor ?? '')}"]`,
        );
        if (splits === null) throw new Error('splits input missing');
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        );
        act(() => {
            descriptor?.set?.call(splits, '2,2');
            splits.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(container.textContent).toContain(
            'a split appears more than once',
        );
        expect(container.textContent).not.toContain('2 accounts at $1,000');
        expect(container.textContent).not.toContain('trials per split');
    });

    it('shows the fallback note when RuinFirst was requested', () => {
        harness.objective = SizingObjective.RuinFirst;
        harness.result = succeeded({
            note: 'RuinFirst only ranks which plan to buy.',
            requestedObjective: SizingObjective.RuinFirst,
        });
        render();
        expect(container.textContent).toContain(
            'RuinFirst only ranks which plan to buy.',
        );
        expect(container.textContent).toContain('objective: monthly net');
    });

    it('never runs the engine on the main thread', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/_components/CopySplitSection.tsx',
            ),
            'utf8',
        );
        expect(source).not.toMatch(
            /runCopySplit|copySplitCandidates|simulate\(/,
        );
        expect(source).toContain('useToolsRequest');
    });
});
