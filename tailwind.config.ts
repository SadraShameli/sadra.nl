import { type Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import { fontFamily } from 'tailwindcss/defaultTheme';

export default {
    content: ['./src/**/*.tsx'],
    theme: {
        borderRadius: {
            DEFAULT: '0.5rem',
        },
        extend: {
            fontFamily: {
                sans: ['var(--font-sans)', ...fontFamily.sans],
            },
            borderColor: {
                light: colors.gray[200],
                DEFAULT: colors.gray[200],
                dark: colors.zinc[900],
            },
            colors: {
                hover: {
                    light: '#8b939b',
                    DEFAULT: '#8b939b',
                    dark: '#8b939b',
                },
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
            },
        },
    },
    future: {
        hoverOnlyWhenSupported: true,
    },
    experimental: {
        optimizeUniversalDefaults: true,
    },
    plugins: [require('@tailwindcss/typography')],
} satisfies Config;
