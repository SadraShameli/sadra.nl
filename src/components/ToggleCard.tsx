'use client';

import { type ReactNode } from 'react';

import { Badge } from '~/components/ui/badge';
import { Checkbox } from '~/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    FieldTitle,
} from '~/components/ui/field';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/lib/utilities';

interface ToggleCardProperties {
    readonly 'aria-describedby'?: string;
    readonly 'aria-invalid'?: boolean;
    readonly checked: boolean;
    readonly className?: string;
    readonly description?: ReactNode;
    readonly descriptionId?: string;
    readonly disabled?: boolean;
    readonly flag?: string;
    readonly id: string;
    readonly label: ReactNode;
    readonly onCheckedChange: (isChecked: boolean) => void;
}

export function CheckboxCard(properties: ToggleCardProperties) {
    return (
        <ToggleCard
            {...properties}
            control={
                <Checkbox
                    aria-describedby={properties['aria-describedby']}
                    aria-invalid={properties['aria-invalid']}
                    checked={properties.checked}
                    disabled={properties.disabled}
                    id={properties.id}
                    onCheckedChange={(state) =>
                        properties.onCheckedChange(state === true)
                    }
                />
            }
            isChecked={properties.checked}
        />
    );
}

export function SwitchCard(properties: ToggleCardProperties) {
    return (
        <ToggleCard
            {...properties}
            control={
                <Switch
                    aria-describedby={properties['aria-describedby']}
                    aria-invalid={properties['aria-invalid']}
                    checked={properties.checked}
                    disabled={properties.disabled}
                    id={properties.id}
                    onCheckedChange={properties.onCheckedChange}
                />
            }
            isChecked={properties.checked}
        />
    );
}

function ToggleCard({
    className,
    control,
    description,
    descriptionId,
    disabled = false,
    flag,
    id,
    isChecked,
    label,
}: Pick<
    ToggleCardProperties,
    | 'className'
    | 'description'
    | 'descriptionId'
    | 'disabled'
    | 'flag'
    | 'id'
    | 'label'
> & {
    readonly control: ReactNode;
    readonly isChecked: boolean;
}) {
    return (
        <FieldLabel
            className={cn(
                'rounded-2xl border-line transition-colors select-none *:data-[slot=field]:px-4 *:data-[slot=field]:py-3',
                disabled
                    ? 'cursor-not-allowed'
                    : 'cursor-pointer hover:border-ink-muted/40',
                className,
            )}
            htmlFor={id}
        >
            <Field data-disabled={disabled} orientation="horizontal">
                {control}
                <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    {description !== undefined && (
                        <FieldDescription id={descriptionId}>
                            {description}
                        </FieldDescription>
                    )}
                </FieldContent>
                {isChecked && flag !== undefined && (
                    <Badge variant="outline">{flag}</Badge>
                )}
            </Field>
        </FieldLabel>
    );
}
