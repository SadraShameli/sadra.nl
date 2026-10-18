import { Bodoni_Moda, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';

const bodoniModa = Bodoni_Moda({
    axes: ['opsz'],
    display: 'swap',
    style: ['normal', 'italic'],
    subsets: ['latin'],
    variable: '--font-bodoni-moda',
});

const hankenGrotesk = Hanken_Grotesk({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-hanken-grotesk',
});

const jetBrainsMono = JetBrains_Mono({
    display: 'swap',
    subsets: ['latin'],
    variable: '--font-jetbrains-mono',
});

export { bodoniModa, hankenGrotesk, jetBrainsMono };
