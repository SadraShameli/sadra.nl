import { cn } from '~/lib/utils';

interface CardProps {
    children: React.ReactNode | React.ReactNode[];
    className?: string;
}

export default function Card({ children, className }: CardProps) {
    return <div className={cn('rounded-2xl border bg-black p-5 xl:p-10', className)}>{children}</div>;
}
