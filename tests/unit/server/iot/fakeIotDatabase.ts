import { drizzle } from 'drizzle-orm/node-postgres';

import * as relationsModule from '~/server/db/relations';
import * as accountingSchema from '~/server/db/schemas/accounting';
import * as authSchema from '~/server/db/schemas/auth';
import * as iotSchema from '~/server/db/schemas/iot';
import * as liftingSchema from '~/server/db/schemas/lifting';
import * as mainSchema from '~/server/db/schemas/main';
import * as notificationSchema from '~/server/db/schemas/notification';
import * as observabilitySchema from '~/server/db/schemas/observability';
import * as tradingSchema from '~/server/db/schemas/trading';

export type FakeRow = Record<string, unknown>;

export interface IssuedQuery {
    params: unknown[];
    text: string;
}

interface QueryConfig {
    rowMode?: string;
    text: string;
}

type Responder = (query: IssuedQuery) => FakeRow[];

export function createFakeIotDatabase(responder: Responder) {
    const queries: IssuedQuery[] = [];
    const client = {
        query(config: QueryConfig, parameters: unknown[] = []) {
            const issued = { params: parameters, text: config.text };
            queries.push(issued);
            const rows = responder(issued);
            if (config.rowMode !== 'array') {
                return Promise.resolve({ rowCount: rows.length, rows });
            }
            const expressions = selectedExpressions(config.text);
            return Promise.resolve({
                rowCount: rows.length,
                rows: rows.map((row) =>
                    expressions.map((expression) =>
                        resolveExpression(expression, row),
                    ),
                ),
            });
        },
    };

    const database = drizzle({
        client: client as never,
        schema: {
            ...mainSchema,
            ...iotSchema,
            ...authSchema,
            ...tradingSchema,
            ...notificationSchema,
            ...observabilitySchema,
            ...accountingSchema,
            ...liftingSchema,
            ...relationsModule,
        },
    });

    return { database, queries };
}

function resolveExpression(expression: string, row: FakeRow): unknown {
    const notNull = /^(?:"\w+"\.)?"(\w+)" is not null$/i.exec(expression);
    if (notNull?.[1]) return row[notNull[1]] != null;
    const aliased = /\bas "(\w+)"$/i.exec(expression);
    if (aliased?.[1]) return row[aliased[1]];
    const column = /"(\w+)"$/.exec(expression);
    if (column?.[1]) return row[column[1]];
    throw new Error(`Unsupported select expression in fake db: ${expression}`);
}

function selectedExpressions(text: string): string[] {
    const match = /^select (.*?) from /is.exec(text);
    return match?.[1] ? splitTopLevel(match[1]) : [];
}

function splitTopLevel(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of list) {
        if (char === '(') depth += 1;
        else if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}
