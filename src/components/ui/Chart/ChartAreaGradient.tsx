export function ChartAreaGradient({
    color = 'var(--chart-1)',
    id,
}: {
    readonly color?: string;
    readonly id: string;
}) {
    return (
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.28} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
    );
}
