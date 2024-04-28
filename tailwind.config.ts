import { type Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import { fontFamily } from 'tailwindcss/defaultTheme';

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
        },
    },
    plugins: [require('@tailwindcss/typography')],
} satisfies Config;
