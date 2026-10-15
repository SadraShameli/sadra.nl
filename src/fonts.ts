import { JetBrains_Mono, Orbitron, Plus_Jakarta_Sans } from 'next/font/google';

const plusJakartaSans = Plus_Jakarta_Sans({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-plus-jakarta-sans',
});

const jetBrainsMono = JetBrains_Mono({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-jetbrains-mono',
});

const orbitron = Orbitron({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-orbitron',
});

export { jetBrainsMono, orbitron, plusJakartaSans };
