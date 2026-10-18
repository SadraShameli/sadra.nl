'use client';

import { useState } from 'react';

import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';

const TOP_LIMIT_ALL = 'all';
const TOP_LIMIT_CHOICES: readonly number[] = [3, 5, 10];
const TOP_LIMIT_DISABLED_HINT =
    'Set hours per day and accounts per session first';

export interface ScreenHourFilters {
    readonly accountsPerSessionInput: string;
    readonly hoursPerDayInput: string;
    readonly onAccountsPerSessionChange: (value: string) => void;
    readonly onHoursPerDayChange: (value: string) => void;
    readonly onTopLimitChange: (value: string) => void;
    readonly topLimitInput: string;
}

interface ScreenHourInputsProperties extends ScreenHourFilters {
    idPrefix: string;
}

export function parseAccountsPerSession(text: string): null | number {
    if (text.trim() === '') return null;
    const n = Number(text);
    return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function parsePositiveNumber(text: string): null | number {
    if (text.trim() === '') return null;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseTopLimit(text: string): null | number {
    const n = Number(text);
    return TOP_LIMIT_CHOICES.includes(n) ? n : null;
}

export function ScreenHourInputs({
    accountsPerSessionInput,
    hoursPerDayInput,
    idPrefix,
    onAccountsPerSessionChange,
    onHoursPerDayChange,
    onTopLimitChange,
    topLimitInput,
}: ScreenHourInputsProperties) {
    const isTopLimitEnabled =
        parsePositiveNumber(hoursPerDayInput) !== null &&
        parseAccountsPerSession(accountsPerSessionInput) !== null;
    const hoursHintId = `${idPrefix}-hours-per-day-hint`;
    const accountsHintId = `${idPrefix}-accounts-per-session-hint`;
    const topLimitHintId = `${idPrefix}-top-limit-hint`;
    const isHoursInvalid =
        hoursPerDayInput.trim() !== '' &&
        parsePositiveNumber(hoursPerDayInput) === null;
    const isAccountsInvalid =
        accountsPerSessionInput.trim() !== '' &&
        parseAccountsPerSession(accountsPerSessionInput) === null;
    return (
        <>
            <Field
                className="w-auto gap-2"
                data-invalid={isHoursInvalid}
                orientation="horizontal"
            >
                <FieldLabel htmlFor={`${idPrefix}-hours-per-day`}>
                    Hours per day
                </FieldLabel>
                <Input
                    aria-describedby={isHoursInvalid ? hoursHintId : undefined}
                    aria-invalid={isHoursInvalid}
                    className="w-24"
                    id={`${idPrefix}-hours-per-day`}
                    min={0}
                    onChange={(event) =>
                        onHoursPerDayChange(event.target.value)
                    }
                    placeholder="off"
                    step={0.5}
                    type="number"
                    value={hoursPerDayInput}
                />
                {isHoursInvalid ? (
                    <FieldError id={hoursHintId}>
                        A number of hours above 0
                    </FieldError>
                ) : null}
            </Field>
            <Field
                className="w-auto gap-2"
                data-invalid={isAccountsInvalid}
                orientation="horizontal"
            >
                <FieldLabel htmlFor={`${idPrefix}-accounts-per-session`}>
                    Accounts per session
                </FieldLabel>
                <Input
                    aria-describedby={
                        isAccountsInvalid ? accountsHintId : undefined
                    }
                    aria-invalid={isAccountsInvalid}
                    className="w-24"
                    id={`${idPrefix}-accounts-per-session`}
                    min={1}
                    onChange={(event) =>
                        onAccountsPerSessionChange(event.target.value)
                    }
                    placeholder="off"
                    step={1}
                    type="number"
                    value={accountsPerSessionInput}
                />
                {isAccountsInvalid ? (
                    <FieldError id={accountsHintId}>
                        Whole number, at least 1
                    </FieldError>
                ) : null}
            </Field>
            <Field
                className="w-auto gap-2"
                data-disabled={!isTopLimitEnabled}
                orientation="horizontal"
            >
                <FieldLabel htmlFor={`${idPrefix}-top-limit`}>
                    Show top
                </FieldLabel>
                <Select
                    disabled={!isTopLimitEnabled}
                    onValueChange={onTopLimitChange}
                    value={topLimitInput}
                >
                    <SelectTrigger
                        aria-describedby={
                            isTopLimitEnabled ? undefined : topLimitHintId
                        }
                        className="w-28"
                        id={`${idPrefix}-top-limit`}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TOP_LIMIT_CHOICES.map((choice) => (
                            <SelectItem key={choice} value={String(choice)}>
                                Top {choice}
                            </SelectItem>
                        ))}
                        <SelectItem value={TOP_LIMIT_ALL}>All</SelectItem>
                    </SelectContent>
                </Select>
                {isTopLimitEnabled ? null : (
                    <span className="sr-only" id={topLimitHintId}>
                        {TOP_LIMIT_DISABLED_HINT}
                    </span>
                )}
            </Field>
        </>
    );
}

export function useScreenHourFilters(): ScreenHourFilters {
    const [hoursPerDayInput, setHoursPerDayInput] = useState('');
    const [accountsPerSessionInput, setAccountsPerSessionInput] = useState('');
    const [topLimitInput, setTopLimitInput] = useState(TOP_LIMIT_ALL);
    return {
        accountsPerSessionInput,
        hoursPerDayInput,
        onAccountsPerSessionChange: (value) => {
            setAccountsPerSessionInput(value);
            if (parseAccountsPerSession(value) === null) {
                setTopLimitInput(TOP_LIMIT_ALL);
            }
        },
        onHoursPerDayChange: (value) => {
            setHoursPerDayInput(value);
            if (parsePositiveNumber(value) === null) {
                setTopLimitInput(TOP_LIMIT_ALL);
            }
        },
        onTopLimitChange: setTopLimitInput,
        topLimitInput,
    };
}
