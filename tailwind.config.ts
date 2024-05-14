import { type Config } from 'tailwindcss';

export default {
    content: ['./src/**/*.tsx', './src/**/*.ts'],
    theme: {
        extend: {
            fontFamily: {
                orbitron: 'var(--font-orbitron)',
            },
            container: {
                center: true,
                padding: '1.75rem',
                screens: {
                    sm: '600px',
                    md: '728px',
                    lg: '980px',
                    xl: '1152px',
                },
            },
            maxWidth: {
                '8xl': '90rem',
                '9xl': '98rem',
                content: '80rem',
            },
            margin: {
                content: '10.25rem',
            },
            borderColor: {
                DEFAULT: 'rgb(35,35,35)',
            },
            keyframes: {
                gradient: {
                    'O%': { backgroundPosition: '0% 50%' },
                    '100%': { backgroundPosition: '100% 50%' },
                },
            },
        },
        animation: {
            gradient: 'gradient 6s ease-out infinite',
            pulse: 'pulse 1s ease-in 0s infinite normal none',
        },
    },
    plugins: [require('@tailwindcss/typography')],
} satisfies Config;
