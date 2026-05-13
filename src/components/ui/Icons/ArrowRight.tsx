import { type SVGProps } from 'react';

export default function ArrowRight(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            {...props}
        >
            <path d="M3,12H21m-3,3,3-3L18,9"></path>
        </svg>
    );
}
