'use client';

import { useCallback, useId, useMemo, useState } from 'react';

import { bankrollVariantWithFundedRisk } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollModel';
import { parseBankrollDollarsField } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollUrlState';
import { copySplitFundedSourceOf } from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import { RulebookSourceNotice } from '~/app/(app)/prop-calculator/_components/bankroll/RulebookSourceNotice';
import { useBankrollVariant } from '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant';
import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { Input } from '~/components/ui/Input';
import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator';
import { type CopySplitFundedSizing } from '~/lib/prop-calculator/advisor/policy';
import { stableJson } from '~/lib/stableJson';

import {
    copySplitHeader,
    copySplitRequest,
    copySplitRowViews,
    defaultCopySplitInputs,
    parseCopySplitInputs,
} from './copySplitModel';
import { CalculatorObjectiveChip } from './ObjectiveChip';

interface FieldAccessibilityProps {
    'aria-describedby'?: string;
    'aria-invalid'?: true;
}

export default function CopySplitSection() {
    const { state: calculatorState } = useCalculatorInputs();
    const { rulebook, rulebookSource, variant } = useBankrollVariant();
    const totalRiskId = useId();
    const splitsId = useId();
    const fundedRiskId = useId();
    const totalRiskIssueId = useId();
    const splitsIssueId = useId();
    const fundedRiskIssueId = useId();
    const [fundedRiskText, setFundedRiskText] = useState<null | string>(null);
    const fundedRiskShown =
        fundedRiskText ?? String(rulebook.funded.riskCents / CENTS_PER_DOLLAR);
    const fundedRisk = parseBankrollDollarsField(fundedRiskShown);
    const fundedVariant = useMemo(
        () =>
            fundedRisk === null
                ? null
                : bankrollVariantWithFundedRisk(variant, fundedRisk),
        [fundedRisk, variant],
    );
    const [text, setText] = useState(() => {
        const defaults = defaultCopySplitInputs(
            variant.base.riskPerTrade,
            calculatorState.copyAccounts,
        );
        return {
            splits: defaults.splits.join(', '),
            totalRisk: String(defaults.totalRisk),
        };
    });
    const parsed = useMemo(() => parseCopySplitInputs(text), [text]);
    const totalRiskIssue = useMemo(
        () =>
            parseCopySplitInputs({ splits: '1', totalRisk: text.totalRisk })
                .issue,
        [text.totalRisk],
    );
    const splitsIssue = useMemo(
        () =>
            parseCopySplitInputs({ splits: text.splits, totalRisk: '1' }).issue,
        [text.splits],
    );
    const funded = useMemo<CopySplitFundedSizing>(
        () => ({
            parameters: rulebook.funded,
            source: copySplitFundedSourceOf(rulebookSource),
        }),
        [rulebook, rulebookSource],
    );
    const { objective } = calculatorState;

    const requestKey =
        fundedVariant === null || parsed.inputs === null
            ? null
            : stableJson({
                  funded,
                  inputs: parsed.inputs,
                  objective,
                  variant: fundedVariant,
              });
    const debouncedRequestKey = useDebouncedValue(requestKey, SIM_DEBOUNCE_MS);
    const buildRequest = useCallback(
        (runId: number) =>
            fundedVariant === null || parsed.inputs === null
                ? null
                : copySplitRequest(
                      fundedVariant,
                      parsed.inputs,
                      objective,
                      funded,
                      runId,
                  ),
        [funded, fundedVariant, objective, parsed.inputs],
    );
    const worker = useToolsRequest(debouncedRequestKey, buildRequest);

    const hasRequest = parsed.inputs !== null && fundedVariant !== null;
    const isComputing =
        hasRequest &&
        (worker.state.phase === ToolsWorkerPhase.Running ||
            requestKey !== debouncedRequestKey);
    const result =
        hasRequest &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.CopySplit
            ? worker.state.result.result
            : null;
    const failureReason =
        worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;
    const header = result === null ? null : copySplitHeader(result);
    const rows = result === null ? [] : copySplitRowViews(result);

    return (
        <section
            aria-labelledby="copy-split-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="copy-split-heading"
            >
                {header?.title ?? 'Split vs concentrate'}
            </h2>
            <p className="text-xs text-muted-foreground">
                The same total risk per trade across N copied accounts against
                one concentrated account, under your engine policy. The
                comparison unit is the whole group of accounts.
            </p>
            <CalculatorObjectiveChip />
            <RulebookSourceNotice source={rulebookSource} />
            <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <label
                        className="text-xs text-muted-foreground"
                        htmlFor={totalRiskId}
                    >
                        Total risk per trade
                    </label>
                    <Input
                        {...invalidFieldProps(
                            totalRiskIssue !== null,
                            totalRiskIssueId,
                        )}
                        className="h-8 w-32"
                        id={totalRiskId}
                        inputMode="decimal"
                        onChange={(event) =>
                            setText((current) => ({
                                ...current,
                                totalRisk: event.target.value,
                            }))
                        }
                        value={text.totalRisk}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label
                        className="text-xs text-muted-foreground"
                        htmlFor={splitsId}
                    >
                        Splits (accounts, comma separated)
                    </label>
                    <Input
                        {...invalidFieldProps(
                            splitsIssue !== null,
                            splitsIssueId,
                        )}
                        className="h-8 w-48"
                        id={splitsId}
                        onChange={(event) =>
                            setText((current) => ({
                                ...current,
                                splits: event.target.value,
                            }))
                        }
                        value={text.splits}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label
                        className="text-xs text-muted-foreground"
                        htmlFor={fundedRiskId}
                    >
                        Funded risk per trade, per account
                    </label>
                    <Input
                        {...invalidFieldProps(
                            fundedRisk === null,
                            fundedRiskIssueId,
                        )}
                        className="h-8 w-32"
                        id={fundedRiskId}
                        inputMode="decimal"
                        onChange={(event) =>
                            setFundedRiskText(event.target.value)
                        }
                        value={fundedRiskShown}
                    />
                </div>
            </div>
            {totalRiskIssue !== null && (
                <p
                    className="text-xs text-rose-400"
                    id={totalRiskIssueId}
                    role="alert"
                >
                    {totalRiskIssue}
                </p>
            )}
            {splitsIssue !== null && (
                <p
                    className="text-xs text-rose-400"
                    id={splitsIssueId}
                    role="alert"
                >
                    {splitsIssue}
                </p>
            )}
            {fundedRisk === null && (
                <p
                    className="text-xs text-rose-400"
                    id={fundedRiskIssueId}
                    role="alert"
                >
                    funded risk must be a positive dollar amount
                </p>
            )}
            {isComputing && (
                <p className="text-xs text-muted-foreground" role="status">
                    Computing the splits...
                </p>
            )}
            {failureReason !== null && hasRequest && (
                <p className="text-xs text-rose-400" role="alert">
                    {failureReason}
                </p>
            )}
            {header !== null && (
                <>
                    <p className="text-xs text-muted-foreground">
                        {header.trialsText}
                    </p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">
                        {header.basisLines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                    {header.note !== null && (
                        <p className="text-xs text-amber-400">{header.note}</p>
                    )}
                    {header.noiseNote !== null && (
                        <p className="text-xs text-amber-400">
                            {header.noiseNote}
                        </p>
                    )}
                </>
            )}
            {rows.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="py-1 pr-3">Split</th>
                                <th className="py-1 pr-3">Eval pass</th>
                                <th className="py-1 pr-3">Days to pass P50</th>
                                <th className="py-1 pr-3">Total fees</th>
                                <th className="py-1 pr-3">
                                    Monthly net (group)
                                </th>
                                <th className="py-1 pr-3">Cycle net (group)</th>
                                <th className="py-1 pr-3">Net per fee $</th>
                                <th className="py-1 pr-3">Contracts</th>
                                <th className="py-1 pr-3">Noise</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    className="border-t border-white/10"
                                    key={row.splitCount}
                                >
                                    <td className="py-1 pr-3 font-mono">
                                        {row.label}
                                    </td>
                                    {row.isRefused ? (
                                        <td
                                            className="py-1 pr-3 text-amber-400"
                                            colSpan={8}
                                        >
                                            Refused: {row.refusal}
                                        </td>
                                    ) : (
                                        <>
                                            <td className="py-1 pr-3 font-mono">
                                                {row.passRate}
                                            </td>
                                            <td className="py-1 pr-3 font-mono">
                                                {row.daysToPass}
                                            </td>
                                            <td className="py-1 pr-3 font-mono">
                                                {row.totalFees}
                                            </td>
                                            <td className="py-1 pr-3 font-mono">
                                                {row.monthlyNet}
                                            </td>
                                            <td className="py-1 pr-3 font-mono">
                                                {row.cycleNet}
                                            </td>
                                            <td className="py-1 pr-3 font-mono">
                                                {row.netPerFeeDollar}
                                            </td>
                                            <td className="py-1 pr-3 text-muted-foreground">
                                                {row.contracts}
                                            </td>
                                            <td className="py-1 pr-3 text-amber-400">
                                                {row.isWithinNoise
                                                    ? 'within noise'
                                                    : ''}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function invalidFieldProps(
    isInvalid: boolean,
    issueId: string,
): FieldAccessibilityProps {
    return isInvalid
        ? { 'aria-describedby': issueId, 'aria-invalid': true }
        : {};
}
