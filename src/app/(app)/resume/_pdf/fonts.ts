import 'server-only';
import { Font } from '@react-pdf/renderer';
import path from 'node:path';

function createFontRegistrar(): () => void {
    let isRegistered = false;

    return function registerFonts(): void {
        if (isRegistered) return;
        isRegistered = true;

        const geistDirectory = path.join(
            process.cwd(),
            'node_modules/geist/dist/fonts/geist-sans',
        );

        Font.register({
            family: 'Geist',
            fonts: [
                {
                    fontWeight: 400,
                    src: path.join(geistDirectory, 'Geist-Regular.ttf'),
                },
                {
                    fontWeight: 500,
                    src: path.join(geistDirectory, 'Geist-Medium.ttf'),
                },
                {
                    fontWeight: 600,
                    src: path.join(geistDirectory, 'Geist-SemiBold.ttf'),
                },
                {
                    fontWeight: 700,
                    src: path.join(geistDirectory, 'Geist-Bold.ttf'),
                },
            ],
        });

        Font.registerHyphenationCallback((word) => [word]);
    };
}

export const registerFonts = createFontRegistrar();
