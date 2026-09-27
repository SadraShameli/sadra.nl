import { type FirmId, parseFirmId } from '../core';
import { StartBasis } from './StartBasis';

export enum LedgerLadderSelection {
    ByCost = 'by-cost',
    BySpeed = 'by-speed',
}

export interface LedgerLadderPlanKey {
    readonly firmId: FirmId;
    readonly variant: null | string;
}

export interface LedgerLadderProvenance {
    readonly contentHash: string;
    readonly file: string;
    readonly row: string;
    readonly section: string;
}

export interface LedgerLadderRow {
    readonly costPerFundedAccount: number;
    readonly daysToFunded: number;
    readonly ladder: readonly number[];
    readonly passRate: number;
    readonly planKey: LedgerLadderPlanKey;
    readonly provenance: LedgerLadderProvenance;
    readonly selection: LedgerLadderSelection;
    readonly stale: boolean;
    readonly startBasis: StartBasis.Fresh;
}

const LADDER_CELL_PATTERN =
    /^(\d+(?:\/\d+)*) \((\d+(?:\.\d+)?)%, (\d+(?:\.\d+)?)d, \$([\d,]+)\)$/;

const INSTANT_FUNDED_CELL = 'instant';

export const LEDGER_FILE =
    '.claude/skills/prop-firm-trading/references/engine-results/2026-09-26-post-audit-rerun.md';
export const LEDGER_SECTION =
    'Result 1: eval ladders (Stage A, 20,000 simulations per ladder)';
export const LEDGER_CONTENT_HASH =
    '8bda3e5e29dcb857e85487a16b65bf3c95df338d38ba6c6c24b93a450f2d22e6';

const RAW_ROWS: readonly (readonly [string, string])[] = [
    ['alphafutures advanced', '700/700/700/700 (33.2%, 9.2d, $601)'],
    ['alphafutures standard', '800/400/800/400 (42.7%, 5.5d, $276)'],
    ['alphafutures zero', '800/200/100/800 (42.3%, 8.6d, $310)'],
    ['apex eod', '800/200/100/800 (40.8%, 8.5d, $1,535)'],
    ['apex intraday', '800/400/800/400 (42.3%, 5.5d, $647)'],
    ['e8futures signature', '800/400/800/600 (42.8%, 5.5d, $374)'],
    ['e8futures zero-max-100', '600/600/600/600 (32.3%, 8.3d, $1,323)'],
    ['e8futures zero-max-80', '600/600/600/600 (32.3%, 8.3d, $1,014)'],
    ['e8futures zero-starter-100', '600/600/600/600 (32.3%, 8.3d, $705)'],
    ['e8futures zero-starter-80', '600/600/600/600 (32.3%, 8.3d, $550)'],
    ['ftmo-futures growth', '600/800/800/600 (41.7%, 6.4d, $273)'],
    ['ftmo-futures pro', '800/200/200/800 (23.0%, 7.5d, $577)'],
    ['fundednext flex', '500/500/500/500 (40.4%, 6.9d, $249)'],
    ['fundednext fnl-003', INSTANT_FUNDED_CELL],
    ['fundednext legacy', '600/800/800/600 (41.7%, 6.4d, $457)'],
    ['fundednext rapid-daily', '800/200/100/800 (41.9%, 8.6d, $563)'],
    ['fundednext rapid-pro', '800/400/800/600 (42.7%, 5.5d, $535)'],
    ['fundednext rapid-pro-dll-add-on', '800/200/100/800 (41.9%, 8.6d, $447)'],
    ['lucid daily-eod', '800/400/800/400 (42.6%, 5.5d, $367)'],
    ['lucid daily-eod-dll', '800/400/800/400 (42.5%, 7.4d, $309)'],
    ['lucid daily-intraday', '800/400/800/400 (42.6%, 5.5d, $311)'],
    ['lucid daily-intraday-dll', '800/400/800/400 (42.5%, 7.4d, $253)'],
    ['lucid direct', INSTANT_FUNDED_CELL],
    ['lucid flex', '800/400/800/400 (42.6%, 5.5d, $287)'],
    ['lucid flex-dll', '800/400/800/400 (42.5%, 7.4d, $253)'],
    ['lucid maxx', '300/500/700/500 (42.2%, 10.0d, $427)'],
    ['lucid pro', '800/400/800/400 (42.5%, 7.4d, $322)'],
    ['lucid pro-no-dll', '800/400/800/600 (42.7%, 5.5d, $380)'],
    ['mffu builder', '800/200/100/800 (41.9%, 8.6d, $365)'],
    ['mffu pro', '800/400/800/400 (42.6%, 5.5d, $622)'],
    ['mffu rapid', '800/400/800/400 (42.6%, 5.5d, $490)'],
    ['mffu rapid-eod', '400/600/800/600 (43.3%, 8.3d, $483)'],
    ['topstep no-fee-consistency', '800/400/800/600 (42.8%, 5.5d, $223)'],
    ['topstep no-fee-consistency-dll', '800/200/100/800 (42.3%, 8.6d, $201)'],
    ['topstep no-fee-standard', '800/400/800/600 (42.8%, 5.5d, $223)'],
    ['topstep no-fee-standard-dll', '800/200/100/800 (42.3%, 8.6d, $201)'],
    ['topstep pro-account', INSTANT_FUNDED_CELL],
    ['topstep standard-consistency', '800/400/800/600 (42.8%, 5.5d, $264)'],
    ['topstep standard-consistency-dll', '800/200/100/800 (42.3%, 8.6d, $268)'],
    ['topstep standard-standard', '800/400/800/600 (42.8%, 5.5d, $264)'],
    ['topstep standard-standard-dll', '800/200/100/800 (42.3%, 8.6d, $268)'],
    ['tpt', '600/800/800/600 (41.7%, 6.4d, $440)'],
    ['tradeify growth', '800/400/800/400 (43.1%, 7.3d, $270)'],
    ['tradeify lightning', INSTANT_FUNDED_CELL],
    ['tradeify select-daily', '500/800/700 (41.8%, 6.5d, $317)'],
    ['tradeify select-flex', '500/800/700 (41.8%, 6.5d, $317)'],
];

function parseLadderCell(
    label: string,
    cell: string,
): null | Omit<LedgerLadderRow, 'planKey' | 'provenance'> {
    if (cell === INSTANT_FUNDED_CELL) return null;
    const match = LADDER_CELL_PATTERN.exec(cell);
    if (match === null) {
        throw new Error(
            `LedgerRecordedLadders: cannot parse ladder cell for "${label}": "${cell}"`,
        );
    }
    const [, rungs = '', passPercent = '', days = '', cost = ''] = match;
    return {
        costPerFundedAccount: Number(cost.replaceAll(',', '')),
        daysToFunded: Number(days),
        ladder: rungs.split('/').map(Number),
        passRate: Number(passPercent) / 100,
        selection: LedgerLadderSelection.BySpeed,
        stale: false,
        startBasis: StartBasis.Fresh,
    };
}

function parsePlanKey(label: string): LedgerLadderPlanKey {
    const [firmToken = '', ...variantParts] = label.split(' ');
    const firmId = parseFirmId(firmToken);
    if (firmId === undefined) {
        throw new Error(`LedgerRecordedLadders: unknown firm in "${label}"`);
    }
    const variant = variantParts.join(' ');
    return { firmId, variant: variant.length === 0 ? null : variant };
}

export const LEDGER_RECORDED_LADDERS: readonly LedgerLadderRow[] = RAW_ROWS.map(
    ([label, cell]) => {
        const parsed = parseLadderCell(label, cell);
        if (parsed === null) return null;
        return {
            ...parsed,
            planKey: parsePlanKey(label),
            provenance: {
                contentHash: LEDGER_CONTENT_HASH,
                file: LEDGER_FILE,
                row: label,
                section: LEDGER_SECTION,
            },
        };
    },
).filter((row): row is LedgerLadderRow => row !== null);

export function ledgerRecordedLadderFor(
    firmId: FirmId,
    variant: null | string,
): LedgerLadderRow | null {
    return (
        LEDGER_RECORDED_LADDERS.find(
            (row) =>
                row.planKey.firmId === firmId &&
                row.planKey.variant === (variant ?? null),
        ) ?? null
    );
}
