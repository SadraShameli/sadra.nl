'use client';

import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { Button } from '~/components/ui/Button';
import { Calendar } from '~/components/ui/Calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { cn } from '~/lib/utils';

interface DatePickerProperties {
    align?: 'center' | 'end' | 'start';
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
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    className={cn(
                        'justify-start gap-2 font-normal',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                    disabled={disabled}
                    id={id}
                    type="button"
                    variant="outline"
                >
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    {value ? (
                        format(value, 'MMM d, y')
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align={align} className="w-auto p-0">
                <Calendar
                    disabled={disabledMatcher}
                    mode="single"
                    onSelect={onChange}
                    selected={value}
                />
            </PopoverContent>
        </Popover>
    );
}

export function DateRangePicker({
    align = 'start',
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
                    className={cn(
                        'justify-start gap-2 font-normal',
                        !value?.from && 'text-muted-foreground',
                        className,
                    )}
                    disabled={disabled}
                    id={id}
                    type="button"
                    variant="outline"
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
    if (!range.to) return format(range.from, 'MMM d, y');
    return `${format(range.from, 'MMM d, y')} – ${format(range.to, 'MMM d, y')}`;
}
