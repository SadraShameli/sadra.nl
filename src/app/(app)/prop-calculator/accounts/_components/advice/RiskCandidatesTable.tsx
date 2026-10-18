import { uncertainCurrencyText } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { formatGateCurrency } from '~/lib/format';

import {
    CANDIDATE_VALUE_BASIS_TEXT,
    type RiskCandidateRowView,
    type RiskCandidatesView,
} from './adviceValueModel';
import { LiveTransferNotesList } from './LiveTransferNotesList';

export const DOCUMENTED_RUNG_MARK = 'Documented rung';

export const ENGINE_OPTIMUM_MARK = 'Engine optimum for this one step';

const CANDIDATES_HAZARD_LABEL =
    'Live-transfer and payout-trigger assumptions behind the risk candidates';

const DOCUMENTED_RUNG_STAYS_TEXT =
    'The documented rung stays your plan: this table compares one trade and does not change it.';

enum RiskCandidateColumn {
    Continuation = 'continuation',
    Contracts = 'contracts',
    NetOfDurationCharge = 'net-of-duration-charge',
    Note = 'note',
    Rank = 'rank',
    Risk = 'risk',
}

export function RiskCandidatesTable({
    view,
}: {
    readonly view: RiskCandidatesView;
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
                {view.label}; {CANDIDATE_VALUE_BASIS_TEXT}.
            </p>
            <p className="text-sm text-muted-foreground">
                {DOCUMENTED_RUNG_STAYS_TEXT}
            </p>
            {view.sizingNote !== null && (
                <p className="text-sm text-muted-foreground">
                    {view.sizingNote}
                </p>
            )}
            <DataTable
                columns={riskCandidateColumns(view.isRanked)}
                data={[...view.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => String(row.rank)}
            />
            <LiveTransferNotesList
                label={CANDIDATES_HAZARD_LABEL}
                notes={view.liveTransferNotes}
            />
        </div>
    );
}

function riskCandidateColumns(
    isRanked: boolean,
): DataTableColumn<RiskCandidateRowView>[] {
    const rank: DataTableColumn<RiskCandidateRowView>[] = isRanked
        ? [
              {
                  cell: ({ row: { original: row } }) => row.rank,
                  header: 'Rank',
                  id: RiskCandidateColumn.Rank,
              },
          ]
        : [];
    return [
        ...rank,
        {
            cell: ({ row: { original: row } }) => (
                <>
                    {row.risk.text}
                    <span className="sr-only"> ({row.risk.label})</span>
                </>
            ),
            header: 'Risk',
            id: RiskCandidateColumn.Risk,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: row } }) => row.contractsText ?? '',
            header: 'Contracts',
            id: RiskCandidateColumn.Contracts,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: row } }) =>
                uncertainCurrencyText(row.continuation),
            header: 'Continuation value (with credit)',
            id: RiskCandidateColumn.Continuation,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: row } }) =>
                formatGateCurrency(row.netOfDurationCharge),
            header: 'Net of duration charge',
            id: RiskCandidateColumn.NetOfDurationCharge,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: row } }) =>
                rowMarksOf(row, isRanked).join('; '),
            header: 'Note',
            id: RiskCandidateColumn.Note,
        },
    ];
}

function rowMarksOf(
    row: RiskCandidateRowView,
    isRanked: boolean,
): readonly string[] {
    return [
        ...(row.isDocumented ? [DOCUMENTED_RUNG_MARK] : []),
        ...(!isRanked && row.isEngineOptimum ? [ENGINE_OPTIMUM_MARK] : []),
    ];
}
