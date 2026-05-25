import { cn } from '~/lib/utils';

type EyebrowProps = React.ComponentProps<'div'> & {
    as?: 'div' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
};

export default function Eyebrow({
    as: Tag = 'div',
    children,
    className,
    ...rest
}: EyebrowProps) {
    return (
        <Tag
            className={cn(
                'text-xs font-medium tracking-wider text-muted-foreground uppercase',
                className,
            )}
            {...rest}
        >
            {children}
        </Tag>
    );
}
