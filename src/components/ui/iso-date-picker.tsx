'use client';

import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Input } from '~/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/utilities';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';

export function IsoDatePicker({
    align = 'end',
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    className,
    disabled,
    id,
    max,
    min,
    name,
    onBlur,
    onChange,
    placeholder = 'YYYY-MM-DD',
    ref,
    value,
}: {
    readonly align?: 'center' | 'end' | 'start';
    readonly 'aria-describedby'?: string;
    readonly 'aria-invalid'?: boolean;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly id?: string;
    readonly max?: string;
    readonly min?: string;
    readonly name?: string;
    readonly onBlur?: () => void;
    readonly onChange: (isoDate: string) => void;
    readonly placeholder?: string;
    readonly ref?: React.Ref<HTMLInputElement>;
    readonly value: null | string | undefined;
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const selected = dateOf(value);
    const minDate = dateOf(min);
    const maxDate = dateOf(max);
    return (
        <div className={cn('relative w-full', className)}>
            <Input
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid}
                autoComplete="off"
                className="pr-10 font-mono tabular-nums"
                data-slot="iso-date-input"
                disabled={disabled}
                id={id}
                inputMode="numeric"
                name={name}
                onBlur={onBlur}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                ref={ref}
                type="text"
                value={value ?? ''}
            />
            <Popover onOpenChange={setIsOpen} open={isOpen}>
                <PopoverTrigger asChild>
                    <Button
                        aria-label="Open calendar"
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        disabled={disabled}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                    >
                        <CalendarIcon />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align={align} className="w-auto p-0">
                    <Calendar
                        defaultMonth={selected}
                        disabled={[
                            ...(minDate === undefined
                                ? []
                                : [{ before: minDate }]),
                            ...(maxDate === undefined
                                ? []
                                : [{ after: maxDate }]),
                        ]}
                        mode="single"
                        onSelect={(date) => {
                            onChange(
                                date === undefined
                                    ? ''
                                    : format(date, ISO_DATE_FORMAT),
                            );
                            setIsOpen(false);
                        }}
                        selected={selected}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

function dateOf(isoDate: null | string | undefined): Date | undefined {
    if (!isoDate) return undefined;
    const date = parseISO(isoDate);
    return isValid(date) ? date : undefined;
}
