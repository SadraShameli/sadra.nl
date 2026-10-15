import { Nunito, Orbitron } from 'next/font/google';

const nunito = Nunito({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-nunito',
});

const orbitron = Orbitron({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-orbitron',
});

export { nunito, orbitron };
