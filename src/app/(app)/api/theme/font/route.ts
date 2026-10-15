import { cacheLife } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';

import { logger } from '~/lib/observability/logger';
import { FontNotFoundError, GoogleFonts } from '~/lib/theme/server';

const FONT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const FONT_CONTENT_TYPE = 'text/css; charset=utf-8';

export async function GET(request: NextRequest) {
    const family = request.nextUrl.searchParams.get('family') ?? '';
    if (!GoogleFonts.isValidFamily(family))
        return new NextResponse(null, { status: 400 });
    let css: null | string;
    try {
        css = await inlinedFontCss(family);
    } catch (error) {
        logger.warn('Theme font download failed', {
            error: error instanceof Error ? error.message : String(error),
            family,
        });
        return new NextResponse(null, { status: 502 });
    }
    if (css === null) return new NextResponse(null, { status: 404 });
    return new NextResponse(css, {
        headers: {
            'Cache-Control': FONT_CACHE_CONTROL,
            'Content-Type': FONT_CONTENT_TYPE,
        },
    });
}

async function inlinedFontCss(family: string): Promise<null | string> {
    'use cache';
    cacheLife('max');
    try {
        return await new GoogleFonts().inlineCss(family);
    } catch (error) {
        if (error instanceof FontNotFoundError) return null;
        throw error;
    }
}
