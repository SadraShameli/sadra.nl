import type { NextConfig } from 'next';

const config: NextConfig = {
    reactStrictMode: true,
    transpilePackages: ['geist'],
    images: {
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    },
};

export default config;
