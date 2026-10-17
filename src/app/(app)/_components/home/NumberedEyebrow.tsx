import { cn } from '~/lib/utilities';

export function NumberedEyebrow({
    className,
    label,
    number,
    ruleClassName,
}: {
    readonly className?: string;
    readonly label: string;
    readonly number: string;
    readonly ruleClassName?: string;
}) {
    return (
        <div
            className={cn(
                'app-home__eyebrow',
                'flex items-center gap-4 type-eyebrow text-ink-muted',
                className,
            )}
        >
            <span className="text-camel">{number}</span>
            <span>{label}</span>
            <span
                aria-hidden
                className={cn('h-px flex-1 bg-line', ruleClassName)}
            />
        </div>
    );
}
