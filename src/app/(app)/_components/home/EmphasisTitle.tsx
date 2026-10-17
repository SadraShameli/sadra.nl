import { type EmphasisHeading } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

export function EmphasisTitle({
    heading,
}: {
    readonly heading: EmphasisHeading;
}) {
    const separator = heading.stacked ? <br /> : ' ';
    return (
        <>
            {heading.before === undefined ? null : (
                <>
                    {heading.before}
                    {separator}
                </>
            )}
            <em className="text-camel">{heading.emphasis}</em>
            {heading.after === undefined ? null : ` ${heading.after}`}
        </>
    );
}

export function SectionHeading({
    className,
    heading,
}: {
    readonly className?: string;
    readonly heading: EmphasisHeading;
}) {
    return (
        <h2
            className={cn(
                'app-home__heading',
                'm-0 type-display-section text-balance text-ink',
                className,
            )}
        >
            <EmphasisTitle heading={heading} />
        </h2>
    );
}
