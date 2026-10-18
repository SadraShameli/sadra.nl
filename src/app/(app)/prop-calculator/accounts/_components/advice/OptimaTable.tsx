import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { Badge } from '~/components/ui/badge';
import { Card } from '~/components/ui/card';
import { DataTable } from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';

import {
    type DpAdviceRecordInput,
    type DpAdviceRowsView,
    type DpAdviceRowView,
    dpAdviceRowViewsOf,
    DpSamplesViewKind,
    figureTextOf,
    type OptimumRowView,
} from './adviceViewModel';

enum OptimaTableColumn {
    Result = 'result',
    Source = 'source',
}

export interface DpAdviceQuery {
    readonly data: readonly DpAdviceRecordInput[] | undefined;
    readonly error: null | { readonly message: string };
    readonly isError: boolean;
}

const NO_DP_ADVICE_TEXT =
    'No DP solve is saved for this account yet. A DP solve is an exact search for the best risk on each trade from this account’s balance and rules; it takes too long to run in the browser, so it is computed ahead of time and shown here once saved.';

const NO_DP_ADVICE_HINT =
    'To add one, run prop advise --dp --store from the command line.';

export function DpAdviceSection({ query }: { readonly query: DpAdviceQuery }) {
    if (query.isError) {
        return (
            <QueryErrorNotice
                message={query.error?.message ?? 'The request failed.'}
                title="The stored DP solves could not be loaded"
            />
        );
    }
    if (query.data === undefined) {
        return (
            <p className="text-sm text-muted-foreground" role="status">
                Loading the stored DP solves.
            </p>
        );
    }
    const view = dpAdviceRowViewsOf(query.data);
    return view.rows.length === 0 ? (
        <EmptyState
            className="border border-dashed py-6"
            description={NO_DP_ADVICE_HINT}
            title={NO_DP_ADVICE_TEXT}
        />
    ) : (
        <DpAdviceRows view={view} />
    );
}

export function OptimaTable({
    rows,
}: {
    readonly rows: readonly OptimumRowView[];
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No engine optima were requested for this stage.
            </p>
        );
    }
    return (
        <DataTable
            columns={[
                {
                    cell: ({ row: { original: row } }) => <>{row.label}</>,
                    header: 'Source',
                    id: OptimaTableColumn.Source,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <>
                            <p>{row.text}</p>
                            {row.figures.length > 0 && (
                                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
                                    {row.figures.map((figure) => (
                                        <li key={figure.kind}>
                                            {figure.label}{' '}
                                            {figureTextOf(figure)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ),
                    header: 'Result',
                    id: OptimaTableColumn.Result,
                },
            ]}
            data={[...rows]}
            isSortable={false}
            pageSize={null}
            rowId={(row) => `${row.source}-${row.label}`}
        />
    );
}

function DpAdviceRowCard({ row }: { readonly row: DpAdviceRowView }) {
    return (
        <li>
            <Card className="gap-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.isValidated ? 'success' : 'warning'}>
                        {row.isValidated ? 'Validated' : 'Not validated'}
                    </Badge>
                    {row.isStale && <Badge variant="destructive">Stale</Badge>}
                </div>
                <p>{row.validationText}</p>
                <p>{row.eligibilityText}</p>
                <TextList className="text-destructive" texts={row.staleTexts} />
                <DpSamples row={row} />
                <TextList
                    className="text-xs text-muted-foreground"
                    texts={row.assumptionTexts}
                />
                <TextList className="text-xs" texts={row.gapTexts} />
                <TextList className="tabular-nums" texts={row.valueTexts} />
                {row.valueNote !== null && (
                    <p className="text-xs text-muted-foreground">
                        {row.valueNote}
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    {row.provenanceText}
                </p>
            </Card>
        </li>
    );
}

function DpAdviceRows({ view }: { readonly view: DpAdviceRowsView }) {
    return (
        <div className="flex flex-col gap-2">
            <ul className="flex list-none flex-col gap-3">
                {view.rows.map((row) => (
                    <DpAdviceRowCard key={row.id} row={row} />
                ))}
            </ul>
            {view.hiddenText !== null && (
                <p className="text-xs text-muted-foreground">
                    {view.hiddenText}
                </p>
            )}
        </div>
    );
}

function DpSamples({ row }: { readonly row: DpAdviceRowView }) {
    const { samples } = row;
    if (samples.kind === DpSamplesViewKind.Unavailable) {
        return <p>{samples.text}</p>;
    }
    return (
        <div className="flex flex-col gap-0.5">
            <p>{samples.stageText}</p>
            <ul className="flex list-none flex-col gap-0.5 text-xs tabular-nums">
                {samples.lines.map((line) => (
                    <li key={line.label}>
                        {`${line.label}, cushion ${line.cushionText}: ${line.riskTexts.join('; ')}`}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TextList({
    className,
    texts,
}: {
    readonly className: string;
    readonly texts: readonly string[];
}) {
    if (texts.length === 0) return null;
    return (
        <ul className={`flex list-none flex-col gap-0.5 ${className}`}>
            {texts.map((text) => (
                <li key={text}>{text}</li>
            ))}
        </ul>
    );
}
