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
import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Card } from '~/components/ui/Card';
import { Field, FieldError, FieldLabel } from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
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
                className="text-lg font-semibold tracking-tight text-foreground"
                id="copy-split-heading"
            >
                {header?.title ?? 'Split vs concentrate'}
            </h2>
            <Card className="gap-4 p-5">
                <p className="text-xs text-muted-foreground">
                    The same total risk per trade across N copied accounts
                    against one concentrated account, under your engine policy.
                    The comparison unit is the whole group of accounts. It ranks
                    the splits by the ranking objective chosen at the top of
                    this page.
                </p>
                <RulebookSourceNotice source={rulebookSource} />
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field data-invalid={totalRiskIssue !== null}>
                        <FieldLabel htmlFor={totalRiskId}>
                            Total risk per trade ($)
                        </FieldLabel>
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
                        <FieldLabel htmlFor={splitsId}>
                            Splits (accounts, comma separated)
                        </FieldLabel>
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
                        <FieldLabel htmlFor={fundedRiskId}>
                            Funded risk per trade, per account ($)
                        </FieldLabel>
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
                {isComputing && (
                    <p className="text-xs text-muted-foreground" role="status">
                        Computing the splits...
                    </p>
                )}
                {failureReason !== null && hasRequest && (
                    <Alert variant="destructive">
                        <AlertDescription>{failureReason}</AlertDescription>
                    </Alert>
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
                            <p className="text-xs text-warning">
                                {header.note}
                            </p>
                        )}
                        {header.noiseNote !== null && (
                            <p className="text-xs text-warning">
                                {header.noiseNote}
                            </p>
                        )}
                    </>
                )}
                {rows.length > 0 && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Split</TableHead>
                                <TableHead>Eval pass</TableHead>
                                <TableHead>Days to pass P50</TableHead>
                                <TableHead>Total fees</TableHead>
                                <TableHead>Monthly net (group)</TableHead>
                                <TableHead>Cycle net (group)</TableHead>
                                <TableHead>Net per fee $</TableHead>
                                <TableHead>Contracts</TableHead>
                                <TableHead>Noise</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="font-mono">
                            {rows.map((row) => (
                                <TableRow key={row.splitCount}>
                                    <TableCell>{row.label}</TableCell>
                                    {row.isRefused ? (
                                        <TableCell
                                            className="font-sans text-warning"
                                            colSpan={8}
                                        >
                                            Refused: {row.refusal}
                                        </TableCell>
                                    ) : (
                                        <>
                                            <TableCell>
                                                {row.passRate}
                                            </TableCell>
                                            <TableCell>
                                                {row.daysToPass}
                                            </TableCell>
                                            <TableCell>
                                                {row.totalFees}
                                            </TableCell>
                                            <TableCell>
                                                {row.monthlyNet}
                                            </TableCell>
                                            <TableCell>
                                                {row.cycleNet}
                                            </TableCell>
                                            <TableCell>
                                                {row.netPerFeeDollar}
                                            </TableCell>
                                            <TableCell className="font-sans text-muted-foreground">
                                                {row.contracts}
                                            </TableCell>
                                            <TableCell className="font-sans">
                                                {row.isWithinNoise ? (
                                                    <Badge variant="warning">
                                                        within noise
                                                    </Badge>
                                                ) : null}
                                            </TableCell>
                                        </>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
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
