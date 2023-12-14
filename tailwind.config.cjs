/* eslint-disable @typescript-eslint/no-var-requires */
const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
const config = {
    experimental: {
        optimizeUniversalDefaults: true,
    },
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
        borderRadius: {
            DEFAULT: '0.5rem',
        },
        extend: {
            fontFamily: {
                sans: ['Inter var', ...defaultTheme.fontFamily.sans],
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
    plugins: [require('@tailwindcss/typography')],
};

module.exports = config;
