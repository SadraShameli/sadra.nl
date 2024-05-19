import { type SVGProps } from 'react';

export default function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            strokeLinejoin="round"
            strokeLinecap="round"
            {...props}
        >
            <path d="M5 12H19M19 12L13 6M19 12L13 18" />
        </svg>
    );
}
