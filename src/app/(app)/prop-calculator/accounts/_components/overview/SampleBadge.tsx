import { Badge } from '~/components/ui/badge';
import { SampleLevel } from '~/lib/prop-accounts/core';

const SAMPLE_BADGE_LABEL: Readonly<Record<SampleLevel, string>> = {
    [SampleLevel.Adequate]: 'Adequate sample',
    [SampleLevel.Low]: 'Low sample',
    [SampleLevel.None]: 'No sample',
};

export function SampleBadge({ level }: { readonly level: null | SampleLevel }) {
    if (level === null) return null;
    return (
        <Badge asChild>
            <span>{SAMPLE_BADGE_LABEL[level]}</span>
        </Badge>
    );
}
