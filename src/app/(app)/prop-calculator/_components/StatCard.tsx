import { Card, CardContent } from '~/components/ui/Card';
import { cn } from '~/lib/utilities';

interface StatCardProperties {
    label: string;
    sub?: string;
    subInheritsColor?: boolean;
    value: string;
    valueClassName?: string;
}

export default function StatCard({
    label,
    sub,
    subInheritsColor = false,
    value,
    valueClassName,
}: StatCardProperties) {
    return (
        <Card className="gap-1 py-2.5">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[11px] text-muted-foreground">
                    {label}
                </span>
                <span
                    className={cn(
                        'font-mono text-lg leading-none font-bold tabular-nums',
                        valueClassName,
                    )}
                >
                    {value}
                </span>
                {sub && (
                    <span
                        className={cn(
                            'text-[10px]',
                            subInheritsColor
                                ? (valueClassName ?? 'text-muted-foreground')
                                : 'text-muted-foreground',
                        )}
                    >
                        {sub}
                    </span>
                )}
            </CardContent>
        </Card>
    );
}
