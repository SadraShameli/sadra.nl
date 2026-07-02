import 'server-only';
import { Font } from '@react-pdf/renderer';
import path from 'node:path';

let isRegistered = false;

export function registerFonts(): void {
    if (isRegistered) return;
    isRegistered = true;

    const geistDir = path.join(
        process.cwd(),
        'node_modules/geist/dist/fonts/geist-sans',
    );

    Font.register({
        family: 'Geist',
        fonts: [
            { fontWeight: 400, src: path.join(geistDir, 'Geist-Regular.ttf') },
            { fontWeight: 500, src: path.join(geistDir, 'Geist-Medium.ttf') },
            {
                fontWeight: 600,
                src: path.join(geistDir, 'Geist-SemiBold.ttf'),
            },
            { fontWeight: 700, src: path.join(geistDir, 'Geist-Bold.ttf') },
        ],
    });

    Font.registerHyphenationCallback((word) => [word]);
}
