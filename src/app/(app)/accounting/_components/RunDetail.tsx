'use client';

import { AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { Booking, LedgerReference } from '~/lib/accounting/core/types';

import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Skeleton } from '~/components/ui/skeleton';
import { Eur } from '~/lib/accounting/core/money';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import { type RunStatus } from '~/lib/accounting/runs/types';
import { formatDisplayDate, formatDisplayDateTime } from '~/lib/format';
import { api, type RouterOutputs } from '~/trpc/react';

import { PushPanel } from './PushPanel';
import { BookingsTable, warningToneFor } from './ResultTables';
import { RunStatusBadge } from './RunStatusBadge';

type RunDetailData = RouterOutputs['accounting']['runs']['get'];

const toastError = (error: { message: string }) => toast.error(error.message);

const PUSHABLE_STATUSES: ReadonlySet<RunStatus> = new Set([
    'failed',
    'partial',
    'planned',
]);

export function RunDetail({ initial }: { initial: RunDetailData }) {
    const utilities = api.useUtils();
    const runQ = api.accounting.runs.get.useQuery(
        { id: initial.id },
        { initialData: initial },
    );
    const run = runQ.data;

    const [bookings, setBookings] = useState<Booking[]>(run.bookings);
    useEffect(() => {
        setBookings(run.bookings);
    }, [run.bookings]);

    const credentialsQ = api.accounting.credentials.list.useQuery();
    const accountingCredential = credentialsQ.data?.find(
        (c) => c.id === run.accountingCredentialId,
    );
    const accountingCredentialId = accountingCredential?.id ?? '';
    const targetLabel = accountingCredential
        ? (CredentialRegistry.instance.get(accountingCredential.kind)?.label ??
          accountingCredential.label)
        : 'accounting backend';
    const isPostable =
        accountingCredentialId.length > 0 && PUSHABLE_STATUSES.has(run.status);
    const skippedCount =
        run.summary.skippedCurrency + run.summary.skippedNoBank;

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId: accountingCredentialId },
        { enabled: !!accountingCredentialId },
    );
    const rulesQ = api.accounting.rules.list.useQuery(
        { credentialId: accountingCredentialId },
        { enabled: !!accountingCredentialId },
    );
    const ledgerOptions = useMemo<LedgerReference[]>(
        () =>
            (ledgersQ.data ?? []).map((l) => ({
                id: l.externalId,
                label: `${l.code} ${l.description}`,
            })),
        [ledgersQ.data],
    );

    const { mutate: updateBooking } =
        api.accounting.runs.updateBooking.useMutation({ onError: toastError });
    const editBooking = useCallback(
        (txnId: string, patch: Partial<Booking>) => {
            setBookings((previous) =>
                previous.map((b) =>
                    b.txnId === txnId ? { ...b, ...patch } : b,
                ),
            );
            updateBooking({
                patch: {
                    counterpartLedger: patch.counterpartLedger,
                    counterpartName: patch.counterpartName,
                    direction: patch.direction,
                    isRefund: patch.isRefund,
                    taxCode: patch.taxCode,
                },
                runId: run.id,
                txnId,
            });
        },
        [run.id, updateBooking],
    );

    const handlePushCompleted = async (s: {
        failed: number;
        posted: number;
    }) => {
        await utilities.accounting.runs.get.invalidate({ id: run.id });
        if (s.failed > 0) {
            toast.warning(
                `Posted ${s.posted}, ${s.failed} failed. See list below.`,
            );
        } else if (s.posted > 0) {
            toast.success(`Posted ${s.posted} mutation(s).`);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <RunStatusBadge status={run.status} />
                <span className="text-sm text-ink-muted">
                    Created {formatDisplayDateTime(run.createdAt)} ·
                    transactions since {formatDisplayDate(run.startDate)} ·
                    target{' '}
                    {credentialsQ.isPending ? (
                        <Skeleton className="inline-block h-4 w-24 align-middle" />
                    ) : (
                        targetLabel
                    )}
                </span>
            </div>

            {run.errorMessage && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{run.errorMessage}</AlertDescription>
                </Alert>
            )}

            <StatStrip
                items={[
                    {
                        id: 'bookings',
                        label: 'Bookings',
                        value: run.summary.bookingsCount.toString(),
                    },
                    {
                        id: 'total',
                        label: 'Total',
                        value: Eur.format(run.summary.totalEur),
                    },
                    {
                        id: 'unknown',
                        label: 'Unknown txns',
                        tone: warningToneFor(run.summary.unknownsCount),
                        value: run.summary.unknownsCount.toString(),
                    },
                    {
                        id: 'skipped',
                        label: 'Skipped',
                        tone: warningToneFor(skippedCount),
                        value: skippedCount.toString(),
                    },
                ]}
            />

            <ToolPanel
                description={`${String(bookings.length)} bookings in this run. Edits are saved as you make them.`}
                title="Bookings"
            >
                <BookingsTable
                    bookings={bookings}
                    credentialId={accountingCredentialId}
                    ledgerOptions={ledgerOptions}
                    onEdit={editBooking}
                    rules={rulesQ.data ?? []}
                />
            </ToolPanel>

            {isPostable && (
                <ToolPanel title={`Post to ${targetLabel}`}>
                    <PushPanel
                        accountingCredentialId={accountingCredentialId || null}
                        bookings={bookings}
                        onCompleted={(s) => void handlePushCompleted(s)}
                        runId={run.id}
                        targetLabel={targetLabel}
                    />
                </ToolPanel>
            )}
        </div>
    );
}
