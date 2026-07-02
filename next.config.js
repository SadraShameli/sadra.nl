import { withSentryConfig } from '@sentry/nextjs';

import './src/env.js';

const isProduction = process.env.NODE_ENV === 'production';

const ContentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://va.vercel-scripts.com https://vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' https://vitals.vercel-insights.com https://vercel.live wss://ws-us3.pusher.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
    "frame-src 'self' https://open.spotify.com https://www.youtube.com https://vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
    {
        key: isProduction
            ? 'Content-Security-Policy'
            : 'Content-Security-Policy-Report-Only',
        value: ContentSecurityPolicy,
    },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=()',
    },
];

/** @type {import("next").NextConfig} */
const config = {
    async headers() {
        return [{ headers: securityHeaders, source: '/:path*' }];
    },
    poweredByHeader: false,
};

export default withSentryConfig(config, {
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
});
