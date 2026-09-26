'use client';

import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';

import {
    PERSONAL_RULE_FIELDS,
    type PersonalRuleKey,
    type PersonalRulesText,
} from './accountPlanOptions';

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
        <div className="app-prop-accounts__personal-rules grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    <div className="flex flex-col gap-2" key={field.key}>
                        <Label htmlFor={id}>
                            {field.label}
                            {field.isMoney && ' ($)'}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                                (optional)
                            </span>
                        </Label>
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
                        <p
                            className="text-xs text-muted-foreground"
                            id={hintId}
                        >
                            {field.hint}
                        </p>
                        {notice !== null && (
                            <p
                                className="text-xs text-amber-400"
                                id={noticeId}
                                role="note"
                            >
                                {notice}
                            </p>
                        )}
                        {error !== undefined && (
                            <p
                                className="text-sm text-destructive"
                                id={errorId}
                            >
                                {error}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
