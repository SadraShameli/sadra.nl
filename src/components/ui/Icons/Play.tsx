import { type SVGProps } from 'react';

export default function PlayIcon(properties: SVGProps<SVGSVGElement>) {
    return (
        <svg
            fill="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            {...properties}
        >
            <path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM9 17L16.8571 12L9 7V17Z" />
        </svg>
    );
}
