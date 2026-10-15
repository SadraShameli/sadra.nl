import 'server-only';

import { THEME_FONT_FAMILY_PATTERN } from '~/lib/theme/ThemeFont';

import { FontNotFoundError, FontUnavailableError } from './ThemeErrors';

const CSS_ENDPOINT = 'https://fonts.googleapis.com/css2';
const FILE_PATTERN = /https:\/\/fonts\.gstatic\.com\/[^)\s'"]+/g;
const AXES: readonly string[] = [':wght@400..700', ':wght@400;500;600;700', ''];
const BLOCK_SEPARATOR = /(?=\/\* [\w-]+ \*\/)/;
const LATIN_BLOCK = '/* latin */';
const REMOTE_URL = /url\((?!data:)/;
const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 20_000;

enum FontFileType {
    Truetype = 'font/ttf',
    Woff = 'font/woff',
    Woff2 = 'font/woff2',
}

export class GoogleFonts {
    static isValidFamily(family: string): boolean {
        return THEME_FONT_FAMILY_PATTERN.test(family);
    }

    private async dataUrl(url: string, family: string): Promise<string> {
        const response = await this.request(url, family);
        if (!response.ok) throw new FontUnavailableError(family);
        const data = Buffer.from(await response.arrayBuffer()).toString(
            'base64',
        );
        return `data:${fileTypeOf(url)};base64,${data}`;
    }

    private async request(url: string, family: string): Promise<Response> {
        try {
            return await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch {
            throw new FontUnavailableError(family);
        }
    }

    private async stylesheet(family: string): Promise<string> {
        const name = family.trim().replaceAll(' ', '+');
        let isMissing = true;
        for (const axis of AXES) {
            const response = await this.request(
                `${CSS_ENDPOINT}?family=${name}${axis}&display=swap`,
                family,
            );
            if (response.ok) return response.text();
            if (response.status >= 500) isMissing = false;
        }
        throw isMissing
            ? new FontNotFoundError(family)
            : new FontUnavailableError(family);
    }

    async inlineCss(family: string): Promise<string> {
        if (!GoogleFonts.isValidFamily(family))
            throw new FontNotFoundError(family);
        const css = await this.stylesheet(family);
        const blocks = css.split(BLOCK_SEPARATOR);
        const latin = blocks.filter((block) => block.startsWith(LATIN_BLOCK));
        let inlined = (latin.length > 0 ? latin : blocks).join('\n');
        const files = [...new Set(inlined.match(FILE_PATTERN))];
        const encoded = await Promise.all(
            files.map(async (url) => [url, await this.dataUrl(url, family)]),
        );
        for (const [url, dataUrl] of encoded) {
            if (url !== undefined && dataUrl !== undefined)
                inlined = inlined.split(url).join(dataUrl);
        }
        if (REMOTE_URL.test(inlined)) throw new FontUnavailableError(family);
        return inlined;
    }
}

function fileTypeOf(url: string): FontFileType {
    if (url.endsWith('.woff2')) return FontFileType.Woff2;
    return url.endsWith('.ttf') ? FontFileType.Truetype : FontFileType.Woff;
}
