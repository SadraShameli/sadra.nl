import { NOT_APPLICABLE } from '~/lib/format';
import {
    compareText,
    type ExternalFirmName,
    type FirmColumns,
    firmKeyId,
    FirmKeyKind,
    firmKeyLabel,
    firmKeyOf,
    formatUsdCents,
    type PortfolioLedger,
    type RoundStatus,
    roundStatusLabel,
    type SampleLevel,
    usdCents,
} from '~/lib/prop-accounts';
import {
    type RoundFirmSummary,
    type RoundReturn,
    roundReturns,
    type RoundSuggestion,
    roundSuggestions,
} from '~/lib/prop-accounts/bankroll';
import { ALL_FIRMS, parseFirmId } from '~/lib/prop-calculator';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

export const ROUNDS_BOOTSTRAP_DRAWS = 500;
export const ROUNDS_BOOTSTRAP_SEED = 20_260_927;

export interface FirmSelectOption {
    readonly label: string;
    readonly value: string;
}

export interface RoundFirmSummaryRow {
    readonly firm: string;
    readonly key: string;
    readonly max: string;
    readonly mean: string;
    readonly min: string;
    readonly rounds: string;
    readonly sampleLevel: null | SampleLevel;
    readonly sharePositive: string;
}

export interface RoundRow {
    readonly budgetPercentUsed: null | number;
    readonly budgetText: string;
    readonly closedOn: null | string;
    readonly firm: string;
    readonly id: string;
    readonly label: string;
    readonly likeThisEndsNetNegative: string;
    readonly netCents: string;
    readonly openedOn: string;
    readonly openMemberCount: number;
    readonly ownOutcomeNetNegative: boolean;
    readonly realizedMultiple: string;
    readonly status: RoundStatus;
    readonly statusLabel: string;
    readonly toDateMultiple: string;
}

export interface RoundsPageModel {
    readonly perFirm: readonly RoundFirmSummaryRow[];
    readonly rounds: readonly RoundRow[];
    readonly suggestions: readonly RoundSuggestionRow[];
    readonly unassignedRoundCount: number;
}

export interface RoundSuggestionRow {
    readonly earliestPurchase: string;
    readonly firm: string;
    readonly firmValue: string;
    readonly key: string;
    readonly label: string;
    readonly latestPurchase: string;
    readonly memberAccountIds: readonly string[];
    readonly memberCount: number;
}

export function firmColumnsFromSelectValue(value: string): FirmColumns | null {
    const separatorIndex = value.indexOf(':');
    if (separatorIndex === -1) return null;
    const kind = value.slice(0, separatorIndex);
    const id = value.slice(separatorIndex + 1);
    if (kind === (FirmKeyKind.Modeled as string)) {
        const firmId = parseFirmId(id);
        return firmId === undefined ? null : { externalFirmId: null, firmId };
    }
    return kind === (FirmKeyKind.External as string)
        ? { externalFirmId: id, firmId: null }
        : null;
}

export function firmSelectOptions(
    externalFirms: readonly ExternalFirmName[],
): readonly FirmSelectOption[] {
    const modeled = ALL_FIRMS.map((firm) => ({
        label: firm.displayName,
        value: firmKeyId({ firmId: firm.id, kind: FirmKeyKind.Modeled }),
    }));
    const own = externalFirms
        .toSorted((a, b) => compareText(a.name, b.name))
        .map((firm) => ({
            label: firm.name,
            value: firmKeyId({
                externalFirmId: firm.id,
                kind: FirmKeyKind.External,
            }),
        }));
    return [...modeled, ...own];
}

export function roundsPageModel(
    ledger: PortfolioLedger,
    sampleThresholds: SampleThresholds,
    roundGapDays: number,
    firms: readonly ExternalFirmName[],
): RoundsPageModel {
    const result = roundReturns({
        draws: ROUNDS_BOOTSTRAP_DRAWS,
        ledger,
        poolNetValuesDollars: [],
        sampleThresholds,
        seed: ROUNDS_BOOTSTRAP_SEED,
    });
    const roundedAccountIds = new Set(
        ledger.accounts
            .filter((entry) => entry.row.roundId != null)
            .map((entry) => entry.row.id),
    );
    const candidates = ledger.accounts
        .filter((entry) => !roundedAccountIds.has(entry.row.id))
        .map((entry) => ({
            accountId: entry.row.id,
            firmKey: firmKeyOf(entry.row),
            purchasedOn: entry.row.purchasedOn,
        }));
    return {
        perFirm: result.perFirm.map((row) => roundFirmSummaryRow(row, firms)),
        rounds: result.rounds
            .toSorted(
                (a, b) =>
                    compareText(b.openedOn, a.openedOn) ||
                    compareText(a.label, b.label),
            )
            .map((row) => roundRow(row, firms)),
        suggestions: roundSuggestions(candidates, roundGapDays).map((row) =>
            roundSuggestionRow(row, firms),
        ),
        unassignedRoundCount: result.unassignedRoundCount,
    };
}

function formatMultiple(value: null | number): string {
    return value === null ? NOT_APPLICABLE : `${value.toFixed(2)}x`;
}

function roundFirmSummaryRow(
    row: RoundFirmSummary,
    firms: readonly ExternalFirmName[],
): RoundFirmSummaryRow {
    return {
        firm: firmKeyLabel(row.firmKey, firms),
        key: firmKeyId(row.firmKey),
        max: formatMultiple(row.max),
        mean: formatMultiple(row.mean),
        min: formatMultiple(row.min),
        rounds: String(row.rounds),
        sampleLevel: row.sampleLevel,
        sharePositive:
            row.sharePositive === null
                ? NOT_APPLICABLE
                : `${(row.sharePositive * 100).toFixed(0)}%`,
    };
}

function roundRow(
    round: RoundReturn,
    firms: readonly ExternalFirmName[],
): RoundRow {
    const { budget } = round;
    return {
        budgetPercentUsed:
            budget.budgetCents === null || budget.budgetCents === 0
                ? null
                : Math.min(100, (budget.spentCents / budget.budgetCents) * 100),
        budgetText:
            budget.budgetCents === null
                ? `${formatUsdCents(usdCents(budget.spentCents))} spent (no budget set)`
                : `${formatUsdCents(usdCents(budget.spentCents))} of ${formatUsdCents(usdCents(budget.budgetCents))}`,
        closedOn: round.closedOn,
        firm:
            round.firmKey === null
                ? NOT_APPLICABLE
                : firmKeyLabel(round.firmKey, firms),
        id: round.id,
        label: round.label,
        likeThisEndsNetNegative:
            round.likeThisEndsNetNegativeClosedForm === null
                ? NOT_APPLICABLE
                : `${(round.likeThisEndsNetNegativeClosedForm * 100).toFixed(1)}%`,
        netCents: formatUsdCents(usdCents(round.netCents)),
        openedOn: round.openedOn,
        openMemberCount: round.openMemberCount,
        ownOutcomeNetNegative: round.ownOutcomeNetNegative,
        realizedMultiple: formatMultiple(round.realizedMultiple?.value ?? null),
        status: round.status,
        statusLabel: roundStatusLabel(round.status),
        toDateMultiple: formatMultiple(round.toDateMultiple),
    };
}

function roundSuggestionRow(
    suggestion: RoundSuggestion,
    firms: readonly ExternalFirmName[],
): RoundSuggestionRow {
    return {
        earliestPurchase: suggestion.earliestPurchase,
        firm: firmKeyLabel(suggestion.firmKey, firms),
        firmValue: firmKeyId(suggestion.firmKey),
        key: `${firmKeyId(suggestion.firmKey)}-${suggestion.earliestPurchase}`,
        label: `${firmKeyLabel(suggestion.firmKey, firms)} ${suggestion.earliestPurchase}`,
        latestPurchase: suggestion.latestPurchase,
        memberAccountIds: suggestion.memberAccountIds,
        memberCount: suggestion.memberAccountIds.length,
    };
}
