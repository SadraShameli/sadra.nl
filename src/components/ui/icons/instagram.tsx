import { type SVGProps } from 'react';

export default function InstagramIcon(properties: SVGProps<SVGSVGElement>) {
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
            <rect height="18" rx="5" width="18" x="3" y="3" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" fill="currentColor" r="0.6" />
        </svg>
    );
}
