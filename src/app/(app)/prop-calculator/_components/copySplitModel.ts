import {
    type BankrollPlanVariantInputs,
    type CopySplitToolsRequest,
    ToolsRequestKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    SIZING_OBJECTIVE_LABEL,
    type SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    COPY_SPLIT_NOISE_SIGMAS,
    type CopySplitFundedSizing,
    type CopySplitResult,
    type CopySplitRow,
    CopySplitRowKind,
} from '~/lib/prop-calculator/advisor/policy';

export interface CopySplitCardInputs {
    readonly splits: readonly number[];
    readonly totalRisk: number;
}

export interface CopySplitHeader {
    readonly basisLines: readonly string[];
    readonly noiseNote: null | string;
    readonly note: null | string;
    readonly title: string;
    readonly trialsText: string;
}

export interface CopySplitInputsText {
    readonly splits: string;
    readonly totalRisk: string;
}

export interface CopySplitParsedInputs {
    readonly inputs: CopySplitCardInputs | null;
    readonly issue: null | string;
}

export interface CopySplitRowView {
    readonly contracts: string;
    readonly cycleNet: string;
    readonly daysToPass: string;
    readonly isRefused: boolean;
    readonly isWithinNoise: boolean;
    readonly label: string;
    readonly monthlyNet: string;
    readonly netPerFeeDollar: string;
    readonly passRate: string;
    readonly refusal: null | string;
    readonly splitCount: number;
    readonly totalFees: string;
}

interface UncertainText {
    readonly standardError: null | number;
    readonly value: number;
}

export const COPY_SPLIT_DEFAULT_SPLITS: readonly number[] = [1, 2, 5, 10];

export const COPY_SPLIT_NOISE_NOTE = `Rows marked within noise differ from the best row by less than ${COPY_SPLIT_NOISE_SIGMAS} combined standard errors: do not read their order as a ranking.`;

const MAX_ACCOUNTS_PER_SPLIT = 20;
const MAX_SPLITS = 12;

export function copySplitHeader(result: CopySplitResult): CopySplitHeader {
    return {
        basisLines: result.basisLines,
        noiseNote:
            result.indistinguishableSplits.length === 0
                ? null
                : COPY_SPLIT_NOISE_NOTE,
        note:
            result.note === null
                ? null
                : `${result.note} The splits are ranked by ${SIZING_OBJECTIVE_LABEL[result.objective]} instead, so this falls back to monthly net.`,
        title: `Split vs concentrate, objective: ${SIZING_OBJECTIVE_LABEL[result.objective]}`,
        trialsText: `${result.trialsPerSplit} trials per split, the same seed for every split; the unit is the whole group of accounts`,
    };
}

export function copySplitRequest(
    variant: BankrollPlanVariantInputs,
    inputs: CopySplitCardInputs,
    objective: SizingObjective,
    funded: CopySplitFundedSizing,
    runId: number,
): CopySplitToolsRequest {
    return {
        funded,
        kind: ToolsRequestKind.CopySplit,
        objective,
        runId,
        splits: inputs.splits,
        totalRisk: inputs.totalRisk,
        variant,
    };
}

export function copySplitRowViews(
    result: CopySplitResult,
): readonly CopySplitRowView[] {
    const noisy = new Set(result.indistinguishableSplits);
    return result.rows.map((row) => rowView(row, noisy.has(row.splitCount)));
}

export function defaultCopySplitInputs(
    riskPerTrade: number,
    copyAccounts: number,
): CopySplitCardInputs {
    return {
        splits: [...new Set([...COPY_SPLIT_DEFAULT_SPLITS, copyAccounts])]
            .filter((split) => split <= MAX_ACCOUNTS_PER_SPLIT)
            .toSorted((a, b) => a - b),
        totalRisk: riskPerTrade * copyAccounts,
    };
}

export function parseCopySplitInputs(
    text: CopySplitInputsText,
): CopySplitParsedInputs {
    const parts = text.splits
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');
    if (parts.length === 0) {
        return refusedInputs('enter at least one split, for example 1, 2, 10');
    }
    if (parts.length > MAX_SPLITS) {
        return refusedInputs(`enter at most ${MAX_SPLITS} splits`);
    }
    const splits = parts.map(Number);
    if (
        splits.some(
            (split) =>
                !Number.isSafeInteger(split) ||
                split < 1 ||
                split > MAX_ACCOUNTS_PER_SPLIT,
        )
    ) {
        return refusedInputs(
            `each split must be a whole number of accounts from 1 to ${MAX_ACCOUNTS_PER_SPLIT}`,
        );
    }
    if (new Set(splits).size !== splits.length) {
        return refusedInputs('a split appears more than once');
    }
    const totalRisk = Number(text.totalRisk);
    return text.totalRisk.trim() === '' ||
        !Number.isFinite(totalRisk) ||
        totalRisk <= 0
        ? refusedInputs('total risk must be a positive dollar amount')
        : { inputs: { splits, totalRisk }, issue: null };
}

function formatRisk(risk: number): string {
    return formatCurrency(risk, Number.isSafeInteger(risk) ? 0 : 2);
}

function formatUncertain({ standardError, value }: UncertainText): string {
    return standardError === null
        ? formatCurrency(value)
        : `${formatCurrency(value)} (SE ${formatCurrency(standardError)})`;
}

function refusedInputs(issue: string): CopySplitParsedInputs {
    return { inputs: null, issue };
}

function rowLabel(splitCount: number, riskPerAccount: number): string {
    const accounts = splitCount === 1 ? 'account' : 'accounts';
    return `${splitCount} ${accounts} at ${formatRisk(riskPerAccount)}`;
}

function rowView(row: CopySplitRow, isWithinNoise: boolean): CopySplitRowView {
    const label = rowLabel(row.splitCount, row.riskPerAccount);
    if (row.kind === CopySplitRowKind.Refused) {
        return {
            contracts: NOT_APPLICABLE,
            cycleNet: NOT_APPLICABLE,
            daysToPass: NOT_APPLICABLE,
            isRefused: true,
            isWithinNoise: false,
            label,
            monthlyNet: NOT_APPLICABLE,
            netPerFeeDollar: NOT_APPLICABLE,
            passRate: NOT_APPLICABLE,
            refusal: row.reason,
            splitCount: row.splitCount,
            totalFees: NOT_APPLICABLE,
        };
    }
    const { placement } = row;
    return {
        contracts:
            placement === null
                ? NOT_APPLICABLE
                : `${placement.contracts} ${placement.contracts === 1 ? 'contract' : 'contracts'} at the eval limit, ${formatCurrency(placement.placedRiskPerAccount)} placed per account, ${formatCurrency(placement.placedRiskPerAccount * row.splitCount)} for the group`,
        cycleNet: formatUncertain(row.cycleNet),
        daysToPass:
            row.passRate > 0 ? row.daysToPassP50.toFixed(0) : NOT_APPLICABLE,
        isRefused: false,
        isWithinNoise,
        label,
        monthlyNet: formatUncertain(row.totalMonthlyNet),
        netPerFeeDollar:
            row.netPerFeeDollar === null
                ? NOT_APPLICABLE
                : row.netPerFeeDollar.toFixed(2),
        passRate: formatPercent(row.passRate),
        refusal: null,
        splitCount: row.splitCount,
        totalFees: formatCurrency(row.totalFees),
    };
}
