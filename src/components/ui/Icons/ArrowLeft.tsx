import { type SVGProps } from 'react';

export default function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24' strokeLinejoin='round' strokeLinecap='round' {...props}>
            <path d='M5 12H19M5 12L11 6M5 12L11 18' />
        </svg>
    );
}
