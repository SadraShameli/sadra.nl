import { cn } from '~/lib/utils';

interface SectionTitleProps {
    className?: string;
    text: string;
}

export default function SectionTitle({ className, text }: SectionTitleProps) {
    return (
        <h2
            className={cn(
                'text-center text-3xl font-semibold lg:text-5xl',
                className,
            )}
        >
            {text}
        </h2>
    );
}
