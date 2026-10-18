'use client';

import { StatusRow, StatusTone } from '~/components/StatusRow';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import InfoPopover from '~/components/ui/info-popover';
import { Input } from '~/components/ui/input';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import { WarningNote } from '~/components/WarningNote';
import {
    AccountTracking,
    type SnapshotField,
    SnapshotFieldRequirement,
    type SnapshotFieldRule,
    SnapshotInputKind,
} from '~/lib/prop-accounts';

import { QueryErrorNotice } from './QueryErrorNotice';
import {
    MONEY_UNIT,
    OPTIONAL_REQUIREMENT,
    RequirementLabel,
} from './RequirementLabel';
import {
    LEDGER_ONLY_SNAPSHOT_NOTICE,
    ledgerOnlySnapshotRules,
    type SnapshotFieldIssue,
    type SnapshotFormValues,
} from './snapshotFieldRules';

export enum SnapshotHintDisplay {
    Inline = 'inline',
    Popover = 'popover',
}

interface SnapshotFieldsEntry {
    readonly fieldWarnings: readonly SnapshotFieldIssue[];
    readonly formIssues: readonly string[];
    readonly formWarnings: readonly string[];
    readonly hintDisplay?: SnapshotHintDisplay;
    readonly idPrefix?: string;
    readonly isReadOnly?: boolean;
    readonly issues: readonly SnapshotFieldIssue[];
    readonly onChange: (field: SnapshotField, value: string) => void;
    readonly values: SnapshotFormValues;
}

type SnapshotFieldsProperties = SnapshotFieldsEntry &
    (
        | {
              readonly rules: readonly SnapshotFieldRule[];
              readonly tracking?: AccountTracking.Modeled;
          }
        | {
              readonly rules?: never;
              readonly tracking: AccountTracking.LedgerOnly;
          }
    );

const REQUIREMENT_NOTE: Readonly<Record<SnapshotFieldRequirement, string>> = {
    [SnapshotFieldRequirement.Hidden]: '',
    [SnapshotFieldRequirement.OneOf]: 'this or the alternative',
    [SnapshotFieldRequirement.Optional]: OPTIONAL_REQUIREMENT,
    [SnapshotFieldRequirement.Required]: 'required',
};

export function SnapshotFields(properties: SnapshotFieldsProperties) {
    const {
        fieldWarnings,
        formIssues,
        formWarnings,
        hintDisplay = SnapshotHintDisplay.Inline,
        idPrefix,
        isReadOnly = false,
        issues,
        onChange,
        values,
    } = properties;
    const idRoot = idPrefix === undefined ? 'snapshot' : `snapshot-${idPrefix}`;
    const isLedgerOnly = properties.tracking === AccountTracking.LedgerOnly;
    const rules = isLedgerOnly ? ledgerOnlySnapshotRules() : properties.rules;
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
        <div className="app-prop-accounts__snapshot-fields grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {isLedgerOnly && (
                <p className="text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
                    {LEDGER_ONLY_SNAPSHOT_NOTICE}
                </p>
            )}
            {formIssues.length > 0 && (
                <QueryErrorNotice
                    className="md:col-span-2 lg:col-span-3"
                    items={formIssues.map((message) => ({
                        key: message,
                        text: message,
                    }))}
                    title="This snapshot does not fit the account"
                />
            )}
            {formWarnings.length > 0 && (
                <StatusRow
                    className="md:col-span-2 lg:col-span-3"
                    detail={formWarnings.map((message) => (
                        <span className="block" key={message}>
                            {message}
                        </span>
                    ))}
                    title="Check this snapshot before saving"
                    tone={StatusTone.Warn}
                />
            )}
            {visible.map((rule) => {
                const id = `${idRoot}-${rule.field}`;
                const issue = issueByField.get(rule.field);
                const warning = warningByField.get(rule.field);
                const hintId = `${id}-hint`;
                const errorId = `${id}-error`;
                const warningId = `${id}-warning`;
                const inlineHint =
                    hintDisplay === SnapshotHintDisplay.Inline
                        ? rule.hint
                        : null;
                const popoverHint =
                    hintDisplay === SnapshotHintDisplay.Popover
                        ? rule.hint
                        : null;
                const describedBy = [
                    inlineHint === null ? null : hintId,
                    issue === undefined ? null : errorId,
                    warning === undefined ? null : warningId,
                ]
                    .filter((part) => part !== null)
                    .join(' ');
                return (
                    <Field data-invalid={issue !== undefined} key={rule.field}>
                        <div className="flex items-center gap-1.5">
                            <FieldLabel htmlFor={id}>
                                <RequirementLabel
                                    label={rule.label}
                                    requirement={
                                        REQUIREMENT_NOTE[rule.requirement]
                                    }
                                    unit={
                                        rule.input === SnapshotInputKind.Money
                                            ? MONEY_UNIT
                                            : undefined
                                    }
                                />
                            </FieldLabel>
                            {popoverHint !== null && (
                                <InfoPopover title={rule.label}>
                                    {popoverHint}
                                </InfoPopover>
                            )}
                        </div>
                        {rule.input === SnapshotInputKind.Date ? (
                            <IsoDatePicker
                                aria-describedby={
                                    describedBy === '' ? undefined : describedBy
                                }
                                aria-invalid={issue !== undefined}
                                disabled={isReadOnly}
                                id={id}
                                onChange={(isoDate) => {
                                    onChange(rule.field, isoDate);
                                }}
                                value={values[rule.field]}
                            />
                        ) : (
                            <Input
                                aria-describedby={
                                    describedBy === '' ? undefined : describedBy
                                }
                                aria-invalid={issue !== undefined}
                                id={id}
                                inputMode={inputModeOf(rule.input)}
                                onChange={(event) => {
                                    if (isReadOnly) return;
                                    onChange(rule.field, event.target.value);
                                }}
                                readOnly={isReadOnly}
                                type="text"
                                value={values[rule.field]}
                            />
                        )}
                        {inlineHint !== null && (
                            <FieldDescription id={hintId}>
                                {inlineHint}
                            </FieldDescription>
                        )}
                        {issue !== undefined && (
                            <FieldError id={errorId}>{issue}</FieldError>
                        )}
                        {warning !== undefined && (
                            <WarningNote
                                className="text-sm/normal"
                                id={warningId}
                            >
                                {warning}
                            </WarningNote>
                        )}
                    </Field>
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
