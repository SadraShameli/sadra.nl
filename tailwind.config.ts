import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';

export default {
    content: ['./src/**/*.tsx'],
    theme: {
        container: {
            center: true,
            padding: {
                sm: '16px',
                xl: '64px',
            },
            screens: {
                sm: '375px',
                md: '768px',
                lg: '1024px',
                xl: '1400px',
            },
        },
        extend: {
            fontFamily: {
                geist: ['var(--font-geist-sans)', ...defaultTheme.fontFamily.sans],
                orbitron: 'var(--font-orbitron)',
            },
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
            },
            spacing: {
                '32': '32px',
                '64': '64px',
                '96': '96px',
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
                gradient: {
                    'O%': { backgroundPosition: '0% 50%' },
                    '100%': { backgroundPosition: '100% 50%' },
                },
                shimmer: {
                    '100%': {
                        transform: 'translateX(100%)',
                    },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                gradient: 'gradient 6s ease-out infinite',
                pulse: 'pulse 1s ease-in 0s infinite normal none',
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
        require('tailwindcss-animate'),
        plugin(function ({ addUtilities, theme }) {
            addUtilities({
                '.pt-spacing': {
                    paddingTop: theme('spacing.64'),
                    '@screen lg': {
                        paddingTop: theme('spacing.96'),
                    },
                },
                '.pb-spacing': {
                    paddingBottom: theme('spacing.64'),
                    '@screen lg': {
                        paddingBottom: theme('spacing.96'),
                    },
                },
                '.py-spacing': {
                    paddingTop: theme('spacing.64'),
                    paddingBottom: theme('spacing.64'),
                    '@screen lg': {
                        paddingTop: theme('spacing.96'),
                        paddingBottom: theme('spacing.96'),
                    },
                },
                '.pt-spacing-inner': {
                    paddingTop: theme('spacing.32'),
                    '@screen lg': {
                        paddingTop: theme('spacing.64'),
                    },
                },
                '.pb-spacing-inner': {
                    paddingBottom: theme('spacing.32'),
                    '@screen lg': {
                        paddingBottom: theme('spacing.64'),
                    },
                },
                '.py-spacing-inner': {
                    paddingTop: theme('spacing.32'),
                    paddingBottom: theme('spacing.32'),
                    '@screen lg': {
                        paddingTop: theme('spacing.64'),
                        paddingBottom: theme('spacing.64'),
                    },
                },
                '.mt-spacing': {
                    marginTop: theme('spacing.64'),
                    '@screen lg': {
                        marginTop: theme('spacing.96'),
                    },
                },
                '.mb-spacing': {
                    marginBottom: theme('spacing.64'),
                    '@screen lg': {
                        marginBottom: theme('spacing.96'),
                    },
                },
                '.my-spacing': {
                    marginTop: theme('spacing.64'),
                    marginBottom: theme('spacing.64'),
                    '@screen lg': {
                        marginTop: theme('spacing.96'),
                        marginBottom: theme('spacing.96'),
                    },
                },
                '.mt-spacing-inner': {
                    marginTop: theme('spacing.32'),
                    '@screen lg': {
                        marginTop: theme('spacing.64'),
                    },
                },
                '.mb-spacing-inner': {
                    marginBottom: theme('spacing.32'),
                    '@screen lg': {
                        marginBottom: theme('spacing.64'),
                    },
                },
                '.my-spacing-inner': {
                    marginTop: theme('spacing.32'),
                    marginBottom: theme('spacing.32'),
                    '@screen lg': {
                        marginTop: theme('spacing.64'),
                        marginBottom: theme('spacing.64'),
                    },
                },
            });
        }),
    ],
} satisfies Config;
