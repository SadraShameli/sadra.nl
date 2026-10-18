export const MONEY_UNIT = '$';

export const OPTIONAL_REQUIREMENT = 'optional';

export function RequirementLabel({
    label,
    requirement,
    unit,
}: {
    readonly label: string;
    readonly requirement?: string;
    readonly unit?: string;
}) {
    return (
        <span>
            {unit === undefined ? label : `${label} (${unit})`}
            {requirement === undefined ? null : (
                <>
                    {' '}
                    <span className="text-xs font-normal whitespace-nowrap text-muted-foreground">
                        ({requirement})
                    </span>
                </>
            )}
        </span>
    );
}
