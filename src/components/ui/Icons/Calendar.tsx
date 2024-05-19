import { type SVGProps } from 'react';

export default function CalendarIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            fill="none"
            stroke="currentColor"
            viewBox="-2 -2 28 28"
            strokeLinejoin="round"
            strokeLinecap="round"
            {...props}
        >
            <path strokeWidth={1.5} d="M8 2V5" />
            <path strokeWidth={1.5} d="M16 2V5" />
            <path strokeWidth={1.5} d="M3.5 9.08997H20.5" />
            <path
                strokeWidth={1.5}
                d="M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z"
            />
            <path strokeWidth={2} d="M15.6947 13.7H15.7037" />
            <path strokeWidth={2} d="M15.6947 16.7H15.7037" />
            <path strokeWidth={2} d="M11.9955 13.7H12.0045" />
            <path strokeWidth={2} d="M11.9955 16.7H12.0045" />
            <path strokeWidth={2} d="M8.29431 13.7H8.30329" />
            <path strokeWidth={2} d="M8.29431 16.7H8.30329" />
        </svg>
    );
}
