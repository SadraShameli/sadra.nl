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
import { LabelWithInfo } from '~/components/LabelWithInfo';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Field, FieldError } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { WarningNote } from '~/components/WarningNote';
import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator';
import { type CopySplitFundedSizing } from '~/lib/prop-calculator/advisor/policy';
import { stableJson } from '~/lib/stableJson';

import {
    copySplitHeader,
    copySplitRequest,
    type CopySplitRowView,
    copySplitRowViews,
    defaultCopySplitInputs,
    parseCopySplitInputs,
} from './copySplitModel';
import { ValueOrMissing } from './ValueOrMissing';

enum CopySplitColumn {
    Contracts = 'contracts',
    CycleNet = 'cycle-net',
    DaysToPass = 'days-to-pass',
    EvalPass = 'eval-pass',
    MonthlyNet = 'monthly-net',
    NetPerFee = 'net-per-fee',
    Noise = 'noise',
    Split = 'split',
    TotalFees = 'total-fees',
}

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
    const noiseNote = header?.noiseNote ?? null;
    const hasContracts = rows.some((row) => row.contracts !== null);
    const hasNoise = rows.some((row) => row.isWithinNoise);
    const fallbackNote = header?.note ?? null;

    return (
        <section aria-labelledby="copy-split-heading">
            <ToolPanel
                description={header?.trialsText}
                info={
                    <>
                        <p>
                            The same total risk per trade across N copied
                            accounts against one concentrated account, under
                            your engine policy. The comparison unit is the whole
                            group of accounts. It ranks the splits by the
                            ranking objective chosen at the top of this page.
                        </p>
                        {header === null ? null : (
                            <ul className="list-disc pl-4">
                                {header.basisLines.map((line) => (
                                    <li key={line}>{line}</li>
                                ))}
                            </ul>
                        )}
                        {noiseNote === null ? null : <p>{noiseNote}</p>}
                    </>
                }
                isComputing={isComputing}
                title={header?.title ?? 'Split vs concentrate'}
                titleId="copy-split-heading"
            >
                <RulebookSourceNotice source={rulebookSource} />
                <div className="grid gap-4 md:grid-cols-3">
                    <Field data-invalid={totalRiskIssue !== null}>
                        <LabelWithInfo
                            htmlFor={totalRiskId}
                            info="Total risk per trade across the whole group, in dollars. Each split puts this total divided by its account count on every account."
                            label="Total risk ($)"
                        />
                        <Input
                            {...invalidFieldProps(
                                totalRiskIssue !== null,
                                totalRiskIssueId,
                            )}
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
                        {totalRiskIssue !== null && (
                            <FieldError id={totalRiskIssueId}>
                                {totalRiskIssue}
                            </FieldError>
                        )}
                    </Field>
                    <Field data-invalid={splitsIssue !== null}>
                        <LabelWithInfo
                            htmlFor={splitsId}
                            info="Account counts to compare, comma separated, such as 1, 2, 5, 10."
                            label="Splits"
                        />
                        <Input
                            {...invalidFieldProps(
                                splitsIssue !== null,
                                splitsIssueId,
                            )}
                            id={splitsId}
                            onChange={(event) =>
                                setText((current) => ({
                                    ...current,
                                    splits: event.target.value,
                                }))
                            }
                            value={text.splits}
                        />
                        {splitsIssue !== null && (
                            <FieldError id={splitsIssueId}>
                                {splitsIssue}
                            </FieldError>
                        )}
                    </Field>
                    <Field data-invalid={fundedRisk === null}>
                        <LabelWithInfo
                            htmlFor={fundedRiskId}
                            info="Funded risk per trade on each account, in dollars. It is the fixed funded amount, not divided by the split."
                            label="Funded risk ($)"
                        />
                        <Input
                            {...invalidFieldProps(
                                fundedRisk === null,
                                fundedRiskIssueId,
                            )}
                            id={fundedRiskId}
                            inputMode="decimal"
                            onChange={(event) =>
                                setFundedRiskText(event.target.value)
                            }
                            value={fundedRiskShown}
                        />
                        {fundedRisk === null && (
                            <FieldError id={fundedRiskIssueId}>
                                funded risk must be a positive dollar amount
                            </FieldError>
                        )}
                    </Field>
                </div>
                {failureReason !== null && hasRequest && (
                    <Alert variant="destructive">
                        <AlertDescription>{failureReason}</AlertDescription>
                    </Alert>
                )}
                {fallbackNote === null ? null : (
                    <StatusRow title={fallbackNote} tone={StatusTone.Warn} />
                )}
                {(rows.length > 0 || isComputing) && (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {row.label}
                                    </span>
                                ),
                                header: 'Split',
                                id: CopySplitColumn.Split,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        <ValueOrMissing value={row.passRate} />
                                    </span>
                                ),
                                header: 'Eval pass',
                                id: CopySplitColumn.EvalPass,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        <ValueOrMissing
                                            value={row.daysToPass}
                                        />
                                    </span>
                                ),
                                header: 'Days to pass P50',
                                id: CopySplitColumn.DaysToPass,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        <ValueOrMissing value={row.totalFees} />
                                    </span>
                                ),
                                header: 'Total fees',
                                id: CopySplitColumn.TotalFees,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        <ValueOrMissing
                                            value={row.monthlyNet}
                                        />
                                    </span>
                                ),
                                header: 'Monthly net (group)',
                                id: CopySplitColumn.MonthlyNet,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        <ValueOrMissing value={row.cycleNet} />
                                    </span>
                                ),
                                header: 'Cycle net (group)',
                                id: CopySplitColumn.CycleNet,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        <ValueOrMissing
                                            value={row.netPerFeeDollar}
                                        />
                                    </span>
                                ),
                                header: 'Net per fee $',
                                id: CopySplitColumn.NetPerFee,
                            },
                            ...(hasContracts
                                ? [
                                      {
                                          cell: ({
                                              row: { original: row },
                                          }) => (
                                              <span className="text-muted-foreground">
                                                  <ValueOrMissing
                                                      value={row.contracts}
                                                  />
                                              </span>
                                          ),
                                          header: 'Contracts',
                                          id: CopySplitColumn.Contracts,
                                      } satisfies DataTableColumn<CopySplitRowView>,
                                  ]
                                : []),
                            ...(hasNoise
                                ? [
                                      {
                                          cell: ({ row: { original: row } }) =>
                                              row.isWithinNoise ? (
                                                  <Badge>within noise</Badge>
                                              ) : null,
                                          header: 'Noise',
                                          id: CopySplitColumn.Noise,
                                      } satisfies DataTableColumn<CopySplitRowView>,
                                  ]
                                : []),
                        ]}
                        data={[...rows]}
                        isLoading={isComputing && rows.length === 0}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => String(row.splitCount)}
                        rowMessage={(row) =>
                            row.isRefused ? (
                                <WarningNote>
                                    Refused: {row.refusal}
                                </WarningNote>
                            ) : undefined
                        }
                    />
                )}
            </ToolPanel>
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
