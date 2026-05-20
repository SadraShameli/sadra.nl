import { ImageResponse } from 'next/og';

import { siteContent } from '~/lib/content';

export const alt = 'sadra.nl';
export const contentType = 'image/png';
export const size = { height: 630, width: 1200 };

export default function Image() {
    return new ImageResponse(
        <div
            style={{
                alignItems: 'flex-start',
                background:
                    'linear-gradient(135deg, #050505 0%, #0f0f0f 60%, #1a1a1a 100%)',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'system-ui, sans-serif',
                height: '100%',
                justifyContent: 'space-between',
                padding: 80,
                width: '100%',
            }}
        >
            <div style={{ color: '#a1a1aa', fontSize: 28, letterSpacing: 4 }}>
                SADRA.NL
            </div>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                <div
                    style={{
                        fontSize: 72,
                        fontWeight: 700,
                        lineHeight: 1.05,
                        maxWidth: 980,
                    }}
                >
                    {siteContent.metaTitle}
                </div>
                <div
                    style={{
                        color: '#d4d4d8',
                        fontSize: 32,
                        maxWidth: 980,
                    }}
                >
                    {siteContent.metaDescription}
                </div>
            </div>
            <div
                style={{
                    color: '#71717a',
                    display: 'flex',
                    fontSize: 22,
                    gap: 24,
                }}
            >
                <span>Portfolio</span>
                <span>Sensor Hub</span>
                <span>Trade Checklist</span>
                <span>Prop Calculator</span>
            </div>
        </div>,
        size,
    );
}
