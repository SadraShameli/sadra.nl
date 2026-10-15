'use client';

import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';

import {
    PERSONAL_RULE_FIELDS,
    type PersonalRuleKey,
    type PersonalRulesText,
} from './accountPlanOptions';
import { FieldRequirementMark } from './FieldRequirementMark';

interface PersonalRulesFieldsProperties {
    readonly errors: Partial<Record<PersonalRuleKey, string>>;
    readonly onChange: (key: PersonalRuleKey, value: string) => void;
    readonly payoutNotice: null | string;
    readonly values: PersonalRulesText;
}

export function PersonalRulesFields({
    errors,
    onChange,
    payoutNotice,
    values,
}: PersonalRulesFieldsProperties) {
    return (
        <div className="app-prop-accounts__personal-rules grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PERSONAL_RULE_FIELDS.map((field) => {
                const id = `personal-rule-${field.key}`;
                const hintId = `${id}-hint`;
                const noticeId = `${id}-notice`;
                const errorId = `${id}-error`;
                const error = errors[field.key];
                const notice =
                    field.key === 'payoutRequestOverrideCents'
                        ? payoutNotice
                        : null;
                const describedBy = [
                    hintId,
                    notice === null ? null : noticeId,
                    error === undefined ? null : errorId,
                ]
                    .filter((part) => part !== null)
                    .join(' ');
                return (
                    <Field data-invalid={error !== undefined} key={field.key}>
                        <FieldLabel
                            className="items-baseline gap-1"
                            htmlFor={id}
                        >
                            {field.label}
                            {field.isMoney && ' ($)'}
                            <FieldRequirementMark text="optional" />
                        </FieldLabel>
                        <Input
                            aria-describedby={describedBy}
                            aria-invalid={error !== undefined}
                            id={id}
                            inputMode={field.isMoney ? 'decimal' : 'numeric'}
                            onChange={(event) => {
                                onChange(field.key, event.target.value);
                            }}
                            value={values[field.key]}
                        />
                        <FieldDescription id={hintId}>
                            {field.hint}
                        </FieldDescription>
                        {notice !== null && (
                            <FieldDescription
                                className="text-warning"
                                id={noticeId}
                                role="note"
                            >
                                {notice}
                            </FieldDescription>
                        )}
                        {error !== undefined && (
                            <FieldError id={errorId}>{error}</FieldError>
                        )}
                    </Field>
                );
            })}
        </div>
    );
}
