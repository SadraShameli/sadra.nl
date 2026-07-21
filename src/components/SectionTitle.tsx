import { cn } from '~/lib/utilities';

interface SectionTitleProperties {
    className?: string;
    text: string;
}

export default function SectionTitle({
    className,
    text,
}: SectionTitleProperties) {
    return (
        <h2
            className={cn(
                'text-center font-orbitron text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl',
                className,
            )}
        >
            {text}
        </h2>
    );
}
