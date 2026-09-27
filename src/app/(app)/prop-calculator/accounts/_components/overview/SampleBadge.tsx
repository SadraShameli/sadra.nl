import { Badge, type BadgeProperties } from '~/components/ui/Badge';
import { SampleLevel } from '~/lib/prop-accounts/core';

const SAMPLE_BADGE_LABEL: Readonly<Record<SampleLevel, string>> = {
    [SampleLevel.Adequate]: 'Adequate sample',
    [SampleLevel.Low]: 'Low sample',
    [SampleLevel.None]: 'No sample',
};

const SAMPLE_BADGE_VARIANT: Readonly<
    Record<SampleLevel, BadgeProperties['variant']>
> = {
    [SampleLevel.Adequate]: 'outline',
    [SampleLevel.Low]: 'warning',
    [SampleLevel.None]: 'destructive',
};

export function SampleBadge({ level }: { readonly level: null | SampleLevel }) {
    if (level === null) return null;
    return (
        <Badge variant={SAMPLE_BADGE_VARIANT[level]}>
            {SAMPLE_BADGE_LABEL[level]}
        </Badge>
    );
}
