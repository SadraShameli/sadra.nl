'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
    emptySnapshotFormValues,
    ledgerOnlySnapshotRules,
    parseSnapshotForm,
    type SnapshotFormResult,
    SnapshotFormResultKind,
    type SnapshotFormValues,
} from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { SnapshotFields } from '~/app/(app)/prop-calculator/accounts/_components/SnapshotFields';
import { Button } from '~/components/ui/Button';
import { AccountTracking, todayIsoDate } from '~/lib/prop-accounts';
import { api } from '~/trpc/react';

export function LedgerOnlySnapshotForm({
    accountId,
    onFailure,
}: {
    readonly accountId: string;
    readonly onFailure: (error: unknown) => void;
}) {
    const utilities = api.useUtils();
    const creation = api.propAccounts.snapshot.create.useMutation();
    const [values, setValues] =
        useState<SnapshotFormValues>(blankValuesForToday);
    const [checked, setChecked] = useState<null | SnapshotFormResult>(null);
    const invalid =
        checked?.kind === SnapshotFormResultKind.Invalid ? checked : null;

    const save = async () => {
        const parsed = parseSnapshotForm(values, ledgerOnlySnapshotRules());
        setChecked(parsed);
        if (parsed.kind === SnapshotFormResultKind.Invalid) return;
        try {
            await creation.mutateAsync({ ...parsed.snapshot, accountId });
            toast.success(`Snapshot of ${parsed.snapshot.asOf} added`);
            setValues(blankValuesForToday());
            setChecked(null);
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <form
            aria-label="Add a snapshot"
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <h3 className="text-sm font-medium">Add a snapshot</h3>
            <SnapshotFields
                fieldWarnings={[]}
                formIssues={invalid?.formIssues ?? []}
                formWarnings={[]}
                issues={invalid?.issues ?? []}
                onChange={(field, value) => {
                    const next = { ...values, [field]: value };
                    setValues(next);
                    if (checked !== null) {
                        setChecked(
                            parseSnapshotForm(next, ledgerOnlySnapshotRules()),
                        );
                    }
                }}
                tracking={AccountTracking.LedgerOnly}
                values={values}
            />
            <Button
                className="self-start"
                disabled={creation.isPending}
                type="submit"
            >
                Add snapshot
            </Button>
        </form>
    );
}

function blankValuesForToday(): SnapshotFormValues {
    return emptySnapshotFormValues(todayIsoDate(new Date()));
}
