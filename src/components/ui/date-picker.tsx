'use client';

import { CalendarIcon } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { FIELD_SURFACE_CLASS } from '~/components/ui/field-surface';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/popover';
import { formatDisplayDate, formatDisplayDateRange } from '~/lib/format';
import { cn } from '~/lib/utilities';

interface DatePickerProperties {
    align?: 'center' | 'end' | 'start';
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    className?: string;
    disabled?: boolean;
    id?: string;
    maxDate?: Date;
    minDate?: Date;
    onChange: (date: Date | undefined) => void;
    placeholder?: string;
    value: Date | undefined;
}

interface DateRangePickerProperties {
    align?: 'center' | 'end' | 'start';
    'aria-label'?: string;
    className?: string;
    disabled?: boolean;
    id?: string;
    maxDate?: Date;
    minDate?: Date;
    onChange: (range: DateRange | undefined) => void;
    placeholder?: string;
    value: DateRange | undefined;
}

export function DatePicker({
    align = 'start',
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    className,
    disabled,
    id,
    maxDate,
    minDate,
    onChange,
    placeholder = 'Pick a date',
    value,
}: DatePickerProperties) {
    const disabledMatcher =
        minDate && maxDate
            ? [{ before: minDate }, { after: maxDate }]
            : minDate
              ? { before: minDate }
              : maxDate
                ? { after: maxDate }
                : undefined;
    const [isOpen, setIsOpen] = React.useState(false);
    return (
        <Popover onOpenChange={setIsOpen} open={isOpen}>
            <PopoverTrigger asChild>
                <Button
                    aria-describedby={ariaDescribedBy}
                    aria-invalid={ariaInvalid}
                    className={cn(
                        FIELD_SURFACE_CLASS,
                        'justify-start gap-2 px-3 font-normal has-[>svg]:px-3',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                    disabled={disabled}
                    id={id}
                    type="button"
                    variant={null}
                >
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    {value ? (
                        formatDisplayDate(value)
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align={align} className="w-auto p-0">
                <Calendar
                    defaultMonth={value}
                    disabled={disabledMatcher}
                    mode="single"
                    onSelect={(date) => {
                        onChange(date);
                        setIsOpen(false);
                    }}
                    selected={value}
                />
            </PopoverContent>
        </Popover>
    );
}

export function DateRangePicker({
    align = 'start',
    'aria-label': ariaLabel,
    className,
    disabled,
    id,
    maxDate,
    minDate,
    onChange,
    placeholder = 'Pick a date range',
    value,
}: DateRangePickerProperties) {
    const label = formatRange(value, placeholder);
    const disabledMatcher =
        minDate && maxDate
            ? [{ before: minDate }, { after: maxDate }]
            : minDate
              ? { before: minDate }
              : maxDate
                ? { after: maxDate }
                : undefined;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    aria-label={ariaLabel}
                    className={cn(
                        FIELD_SURFACE_CLASS,
                        'justify-start gap-2 px-3 font-normal has-[>svg]:px-3',
                        !value?.from && 'text-muted-foreground',
                        className,
                    )}
                    disabled={disabled}
                    id={id}
                    type="button"
                    variant={null}
                >
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    {label}
                </Button>
            </PopoverTrigger>
            <PopoverContent align={align} className="w-auto p-0">
                <Calendar
                    defaultMonth={value?.from}
                    disabled={disabledMatcher}
                    mode="range"
                    numberOfMonths={2}
                    onSelect={onChange}
                    selected={value}
                />
            </PopoverContent>
        </Popover>
    );
}

function formatRange(
    range: DateRange | undefined,
    placeholder: string,
): React.ReactNode {
    if (!range?.from) return <span>{placeholder}</span>;
    return range.to
        ? formatDisplayDateRange(range.from, range.to)
        : formatDisplayDate(range.from);
}
