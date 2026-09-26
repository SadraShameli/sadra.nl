'use client';

import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    type SnapshotField,
    SnapshotFieldRequirement,
    type SnapshotFieldRule,
    SnapshotInputKind,
} from '~/lib/prop-accounts';

import {
    type SnapshotFieldIssue,
    type SnapshotFormValues,
} from './snapshotFieldRules';

interface SnapshotFieldsProperties {
    readonly fieldWarnings: readonly SnapshotFieldIssue[];
    readonly formIssues: readonly string[];
    readonly formWarnings: readonly string[];
    readonly issues: readonly SnapshotFieldIssue[];
    readonly onChange: (field: SnapshotField, value: string) => void;
    readonly rules: readonly SnapshotFieldRule[];
    readonly values: SnapshotFormValues;
}

const REQUIREMENT_NOTE: Readonly<Record<SnapshotFieldRequirement, string>> = {
    [SnapshotFieldRequirement.Hidden]: '',
    [SnapshotFieldRequirement.OneOf]: 'this or the alternative',
    [SnapshotFieldRequirement.Optional]: 'optional',
    [SnapshotFieldRequirement.Required]: 'required',
};

export function SnapshotFields({
    fieldWarnings,
    formIssues,
    formWarnings,
    issues,
    onChange,
    rules,
    values,
}: SnapshotFieldsProperties) {
    const issueByField = new Map(
        issues.map((issue) => [issue.field, issue.message]),
    );
    const warningByField = new Map(
        fieldWarnings.map((warning) => [warning.field, warning.message]),
    );
    const visible = rules.filter(
        (rule) => rule.requirement !== SnapshotFieldRequirement.Hidden,
    );
    return (
        <div className="app-prop-accounts__snapshot-fields grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {formIssues.length > 0 && (
                <Alert
                    className="sm:col-span-2 lg:col-span-3"
                    variant="destructive"
                >
                    <TriangleAlert />
                    <AlertTitle>
                        This snapshot does not fit the account
                    </AlertTitle>
                    <AlertDescription>
                        <ul className="flex flex-col gap-1">
                            {formIssues.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            {formWarnings.length > 0 && (
                <Alert
                    className="sm:col-span-2 lg:col-span-3"
                    variant="warning"
                >
                    <TriangleAlert />
                    <AlertTitle>Check this snapshot before saving</AlertTitle>
                    <AlertDescription>
                        <ul className="flex flex-col gap-1">
                            {formWarnings.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            {visible.map((rule) => {
                const id = `snapshot-${rule.field}`;
                const issue = issueByField.get(rule.field);
                const warning = warningByField.get(rule.field);
                const hintId = `${id}-hint`;
                const errorId = `${id}-error`;
                const warningId = `${id}-warning`;
                const describedBy = [
                    rule.hint === null ? null : hintId,
                    issue === undefined ? null : errorId,
                    warning === undefined ? null : warningId,
                ]
                    .filter((part) => part !== null)
                    .join(' ');
                return (
                    <div className="flex flex-col gap-2" key={rule.field}>
                        <Label htmlFor={id}>
                            {rule.label}
                            {rule.input === SnapshotInputKind.Money && ' ($)'}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                                ({REQUIREMENT_NOTE[rule.requirement]})
                            </span>
                        </Label>
                        <Input
                            aria-describedby={
                                describedBy === '' ? undefined : describedBy
                            }
                            aria-invalid={issue !== undefined}
                            id={id}
                            inputMode={inputModeOf(rule.input)}
                            onChange={(event) => {
                                onChange(rule.field, event.target.value);
                            }}
                            type={
                                rule.input === SnapshotInputKind.Date
                                    ? 'date'
                                    : 'text'
                            }
                            value={values[rule.field]}
                        />
                        {rule.hint !== null && (
                            <p
                                className="text-xs text-muted-foreground"
                                id={hintId}
                            >
                                {rule.hint}
                            </p>
                        )}
                        {issue !== undefined && (
                            <p
                                className="text-sm text-destructive"
                                id={errorId}
                            >
                                {issue}
                            </p>
                        )}
                        {warning !== undefined && (
                            <p
                                className="text-sm text-amber-400"
                                id={warningId}
                            >
                                {warning}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function inputModeOf(input: SnapshotInputKind): 'decimal' | 'numeric' | 'text' {
    switch (input) {
        case SnapshotInputKind.Count: {
            return 'numeric';
        }
        case SnapshotInputKind.Date: {
            return 'text';
        }
        case SnapshotInputKind.Money: {
            return 'decimal';
        }
    }
}
