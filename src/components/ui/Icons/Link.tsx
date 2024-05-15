import { type SVGProps } from 'react';

export default function LinkIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeLinejoin='round' strokeLinecap='round' {...props}>
            <path d='M7 17L17 7' />
            <path d='M7 7h10v10' />
        </svg>
    );
}
