import { type ReactNode } from 'react';

import { FieldLabel } from '~/components/ui/field';
import InfoPopover from '~/components/ui/info-popover';

export function LabelWithInfo({
    htmlFor,
    info,
    label,
}: {
    readonly htmlFor?: string;
    readonly info?: ReactNode;
    readonly label: string;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
            {info === undefined ? null : (
                <InfoPopover title={label}>{info}</InfoPopover>
            )}
        </div>
    );
}
