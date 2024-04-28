import { Poppins as defaultfont, Orbitron } from 'next/font/google';

export const defaultFont = defaultfont({
    variable: '--font-default',
    subsets: ['latin'],
    display: 'swap',
    weight: '400',
});

export const orbitron = Orbitron({
    variable: '--font-orbitron',
    subsets: ['latin'],
    display: 'swap',
});
