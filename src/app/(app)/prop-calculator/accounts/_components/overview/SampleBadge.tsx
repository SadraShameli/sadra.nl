import { Badge, type BadgeProperties } from '~/components/ui/badge';
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
        <Badge asChild variant={SAMPLE_BADGE_VARIANT[level]}>
            <span>{SAMPLE_BADGE_LABEL[level]}</span>
        </Badge>
    );
}
