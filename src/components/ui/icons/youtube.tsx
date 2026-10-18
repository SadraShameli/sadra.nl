import { type SVGProps } from 'react';

export default function YoutubeIcon(properties: SVGProps<SVGSVGElement>) {
    return (
        <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            viewBox="0 0 24 24"
            {...properties}
        >
            <rect height="14" rx="4" width="19" x="2.5" y="5" />
            <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
        </svg>
    );
}
