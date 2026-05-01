import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob';
import path from 'path';
import { buildConfig } from 'payload';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

import { Media } from './collections/Media';
import { Users } from './collections/Users';
import { Homepage } from './globals/Homepage';
import { Resume } from './globals/Resume';
import { Site } from './globals/Site';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

import pg from 'pg';
import { pool } from './server/db/index';

const ProxiedPg = Object.assign({}, pg, {
    Pool: class extends pg.Pool {
        constructor() {
            super();
            return pool;
        }
    },
});

export default buildConfig({
    admin: {
        user: Users.slug,
        importMap: {
            baseDir: path.resolve(dirname),
        },
    },
    collections: [Users, Media],
    globals: [Site, Homepage, Resume],
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: {
        outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: postgresAdapter({
        pg: ProxiedPg as any,
        pool: {
            connectionString: (() => {
                const url = new URL(process.env.DATABASE_URL ?? '');
                url.searchParams.delete('uselibpqcompat');
                url.searchParams.delete('sslmode');
                return url.toString();
            })(),
        },
        idType: 'serial',
        migrationDir: path.resolve(dirname, './migrations'),
    }),
    sharp,
    plugins: [
        vercelBlobStorage({
            enabled: true,
            clientUploads: true,
            collections: {
                media: true,
            },
            addRandomSuffix: true,
            token: process.env.BLOB_READ_WRITE_TOKEN,
        }),
    ],
});
