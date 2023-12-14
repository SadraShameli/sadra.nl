import { type SVGProps } from 'react';

export default function StackIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg fill='none' stroke='currentColor' strokeWidth={1.5} viewBox='0 0 16 16' {...props}>
            <path d='m1.75 11 6.25 3.25 6.25-3.25m-12.5-3 6.25 3.25 6.25-3.25m-6.25-6.25-6.25 3.25 6.25 3.25 6.25-3.25z' />
        </svg>
    );
}
