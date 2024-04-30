import { type Config } from 'tailwindcss';
import { backgroundPosition, fontFamily } from 'tailwindcss/defaultTheme';

export default {
    content: ['./src/**/*.tsx'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-default)', ...fontFamily.sans],
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
                main: '80rem',
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
            animation: {
                gradient: 'gradient 6s ease-out infinite',
            },
        },
    },
    plugins: [require('@tailwindcss/typography')],
} satisfies Config;
