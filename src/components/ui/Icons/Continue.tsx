import { type SVGProps } from 'react';

export default function ContinueIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            fill="currentColor"
            viewBox="0 0 16 16"
            strokeLinejoin="round"
            strokeLinecap="round"
            {...props}
        >
            <path d="M2.5 2H4v12H2.5V2zm4.936.39L6.25 3v10l1.186.61 7-5V7.39l-7-5zM12.71 8l-4.96 3.543V4.457L12.71 8z" />
        </svg>
    );
}
