import { Geist, Orbitron } from 'next/font/google';

const geist = Geist({
    subsets: ['latin'],
    variable: '--font-geist-sans',
});

const orbitron = Orbitron({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-orbitron',
});

export { geist, orbitron };
