import { Gauge } from 'lucide-react';
import { memo } from 'react';

import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import {
    type FigureColumn,
    figureColumns,
} from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { formatDisplayDate, NOT_APPLICABLE } from '~/lib/format';

import {
    type CushionBoardCardModel,
    isAwaitingOnlySnapshots,
} from './overviewModel';
import { OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum CushionBoardCardColumn {
    Account = 'account',
    AsOf = 'as-of',
    Cushion = 'cushion',
    CushionInRiskUnits = 'cushion-in-risk-units',
    Floor = 'floor',
    Rank = 'rank',
    Stage = 'stage',
}

interface CushionBoardDisplayRow extends CushionBoardRow {
    readonly reason: null | string;
}

type CushionBoardRow = CushionBoardCardModel['rows'][number];

const CUSHION_BOARD_COLUMNS: readonly FigureColumn<CushionBoardDisplayRow>[] = [
    {
        align: DataTableAlign.End,
        header: 'Rank',
        id: CushionBoardCardColumn.Rank,
        textOf: (row) => row.rank,
    },
    {
        header: 'Account',
        id: CushionBoardCardColumn.Account,
        isRowHeader: true,
        textOf: (row) => row.account,
    },
    {
        header: 'Stage',
        id: CushionBoardCardColumn.Stage,
        textOf: (row) => row.basis,
    },
    {
        align: DataTableAlign.End,
        header: 'Floor',
        id: CushionBoardCardColumn.Floor,
        textOf: (row) => row.floor,
    },
    {
        align: DataTableAlign.End,
        header: 'Cushion',
        id: CushionBoardCardColumn.Cushion,
        reasonOf: (row) => row.reason ?? undefined,
        textOf: (row) => row.cushion,
    },
    {
        align: DataTableAlign.End,
        header: 'Cushion in risk units',
        id: CushionBoardCardColumn.CushionInRiskUnits,
        textOf: (row) => row.ratio,
    },
    {
        header: 'As of',
        id: CushionBoardCardColumn.AsOf,
        textOf: (row) => (row.asOf === '' ? '' : formatDisplayDate(row.asOf)),
    },
];

export const CushionBoardCard = memo(function CushionBoardCard({
    model,
}: {
    readonly model: CushionBoardCardModel;
}) {
    if (model.rows.length === 0 && isAwaitingOnlySnapshots(model.unavailable)) {
        return (
            <OverviewEmptyPanel
                action={<EnterBalancesButton />}
                description="The board ranks accounts by how close each balance is to its floor."
                icon={Gauge}
                section={OverviewSectionId.CushionBoard}
                title="Enter balances to see the cushion board"
            />
        );
    }
    const rows: readonly CushionBoardDisplayRow[] = [
        ...model.rows.map((row) => ({ ...row, reason: null })),
        ...model.unavailable.map((row) => ({
            account: row.account,
            asOf: '',
            basis: NOT_APPLICABLE,
            cushion: NOT_APPLICABLE,
            floor: NOT_APPLICABLE,
            key: row.key,
            rank: '',
            ratio: NOT_APPLICABLE,
            reason: sentenceOf(row.reason),
        })),
    ];
    return (
        <OverviewPanel
            info={model.disclosure}
            section={OverviewSectionId.CushionBoard}
        >
            <DataTable
                columns={figureColumns(CUSHION_BOARD_COLUMNS, rows)}
                data={[...rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
        </OverviewPanel>
    );
});
