import 'server-only';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { siteContent } from '~/lib/site/content';
import { SITE_NAME } from '~/lib/site/siteName';

interface BrandImageSize {
    readonly height: number;
    readonly width: number;
}

export const BRAND_IMAGE_CONTENT_TYPE = 'image/png';

export const BRAND_CARD_SIZE: BrandImageSize = { height: 630, width: 1200 };

interface BrandIconSpec {
    readonly cornerRatio: number;
    readonly size: BrandImageSize;
}

export const BRAND_ICON_SIZE: BrandImageSize = { height: 32, width: 32 };
export const BRAND_APPLE_ICON_SIZE: BrandImageSize = {
    height: 180,
    width: 180,
};

export const BRAND_ICON: BrandIconSpec = {
    cornerRatio: 0.2,
    size: BRAND_ICON_SIZE,
};

export const BRAND_APPLE_ICON: BrandIconSpec = {
    cornerRatio: 0,
    size: BRAND_APPLE_ICON_SIZE,
};

export const BRAND_CARD_ALT = `${siteContent.metaTitle}: ${siteContent.manifest.description}`;

enum BrandColor {
    Background = '#000000',
    Border = '#262626',
    Foreground = '#ffffff',
    Muted = '#828282',
}

enum BrandFontWeight {
    SemiBold = 600,
}

const BRAND_FONT_NAME = 'Geist';

const BRAND_FONT_FILE = path.join(
    process.cwd(),
    'node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf',
);

const ICON_GLYPH_RATIO = 0.62;

export async function brandCardImage(): Promise<ImageResponse> {
    return new ImageResponse(
        <div
            style={{
                background: BrandColor.Background,
                border: `2px solid ${BrandColor.Border}`,
                color: BrandColor.Foreground,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: BRAND_FONT_NAME,
                height: '100%',
                justifyContent: 'space-between',
                padding: 80,
                width: '100%',
            }}
        >
            <div
                style={{
                    color: BrandColor.Muted,
                    display: 'flex',
                    fontSize: 32,
                    letterSpacing: 6,
                    textTransform: 'uppercase',
                }}
            >
                {SITE_NAME}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', fontSize: 104 }}>
                    {siteContent.metaTitle}
                </div>
                <div
                    style={{
                        color: BrandColor.Muted,
                        display: 'flex',
                        fontSize: 44,
                    }}
                >
                    {siteContent.manifest.description}
                </div>
            </div>
        </div>,
        { ...BRAND_CARD_SIZE, fonts: await brandFonts() },
    );
}

export async function brandIconImage({
    cornerRatio,
    size,
}: BrandIconSpec): Promise<ImageResponse> {
    return new ImageResponse(
        <div
            style={{
                alignItems: 'center',
                background: BrandColor.Background,
                borderRadius: size.width * cornerRatio,
                color: BrandColor.Foreground,
                display: 'flex',
                fontFamily: BRAND_FONT_NAME,
                fontSize: size.height * ICON_GLYPH_RATIO,
                height: '100%',
                justifyContent: 'center',
                width: '100%',
            }}
        >
            {siteContent.metaTitle.charAt(0)}
        </div>,
        { ...size, fonts: await brandFonts() },
    );
}

async function brandFonts() {
    const data = await readFile(BRAND_FONT_FILE);
    return [
        {
            data,
            name: BRAND_FONT_NAME,
            style: 'normal' as const,
            weight: BrandFontWeight.SemiBold,
        },
    ];
}
