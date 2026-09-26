'use client';

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
    issues,
    onChange,
    rules,
    values,
}: SnapshotFieldsProperties) {
    const issueByField = new Map(
        issues.map((issue) => [issue.field, issue.message]),
    );
    const visible = rules.filter(
        (rule) => rule.requirement !== SnapshotFieldRequirement.Hidden,
    );
    return (
        <div className="app-prop-accounts__snapshot-fields grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((rule) => {
                const id = `snapshot-${rule.field}`;
                const issue = issueByField.get(rule.field);
                const hintId = `${id}-hint`;
                const errorId = `${id}-error`;
                const describedBy = [
                    rule.hint === null ? null : hintId,
                    issue === undefined ? null : errorId,
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
