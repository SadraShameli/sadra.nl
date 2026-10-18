import { existsSync } from 'node:fs';
import path from 'node:path';

export function hasPageFile(root: string, segment: string): boolean {
    return existsSync(path.join(root, segment, 'page.tsx'));
}

export function propCalculatorAppDir(...segments: string[]): string {
    return path.join(
        process.cwd(),
        'src',
        'app',
        '(app)',
        'prop-calculator',
        ...segments,
    );
}
