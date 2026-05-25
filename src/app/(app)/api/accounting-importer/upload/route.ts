import { type NextRequest, NextResponse } from 'next/server';

import type { RawTransaction } from '~/lib/accounting-importer/core/types';

import { sniffCsvHeaders } from '~/lib/accounting-importer/sources/csv-base';
import {
    detectCsvSource,
    listCsvSources,
} from '~/lib/accounting-importer/sources/source';
import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import '~/lib/accounting-importer/sources/index';
import { captureError } from '~/lib/observability/logger';
import { checkRateLimit } from '~/lib/observability/rate-limit';

const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 5 * 1024 * 1024;

interface ParsedFileResult {
    error: null | string;
    headers: string[];
    name: string;
    size: number;
    sourceId: null | string;
    sourceLabel: null | string;
    transactions: RawTransaction[];
}

export async function POST(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        'unknown';
    const ok = await checkRateLimit({
        bucket: 'accounting-importer:upload',
        key: session.user.id || ip,
        max: 30,
        windowMs: 60 * 60 * 1000,
    });
    if (!ok) {
        return NextResponse.json(
            { error: 'too_many_requests' },
            { status: 429 },
        );
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch (error) {
        captureError(error, { tag: 'accounting-importer.upload.formData' });
        return NextResponse.json(
            { error: 'invalid_multipart' },
            { status: 400 },
        );
    }

    const files = form
        .getAll('files')
        .filter((f): f is File => f instanceof File);
    if (files.length === 0) {
        return NextResponse.json({ files: [] as ParsedFileResult[] });
    }
    if (files.length > MAX_FILES) {
        return NextResponse.json(
            { error: 'too_many_files', max: MAX_FILES },
            { status: 400 },
        );
    }

    const results: ParsedFileResult[] = [];
    for (const file of files) {
        const result: ParsedFileResult = {
            error: null,
            headers: [],
            name: file.name,
            size: file.size,
            sourceId: null,
            sourceLabel: null,
            transactions: [],
        };
        if (file.size > MAX_BYTES_PER_FILE) {
            result.error = `File too large (>${MAX_BYTES_PER_FILE / 1024 / 1024}MB)`;
            results.push(result);
            continue;
        }
        try {
            const text = await file.text();
            const headers = sniffCsvHeaders(text);
            result.headers = headers;
            const source = detectCsvSource(headers);
            if (!source) {
                const known = listCsvSources()
                    .map((s) => s.label)
                    .join(', ');
                result.error = `Unrecognised CSV. Known formats: ${known}`;
                results.push(result);
                continue;
            }
            result.sourceId = source.id;
            result.sourceLabel = source.label;
            result.transactions = source.parse(text);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            captureError(error, {
                fields: { name: file.name },
                tag: 'accounting-importer.upload.parse',
            });
            result.error = message;
        }
        results.push(result);
    }

    return NextResponse.json({ files: results });
}

export const runtime = 'nodejs';
