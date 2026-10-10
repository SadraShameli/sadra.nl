import { drizzle } from 'drizzle-orm/node-postgres';
import { expect } from 'vitest';
import { z } from 'zod';

import * as relationsModule from '~/server/db/relations';
import * as accountingSchema from '~/server/db/schemas/accounting';
import * as authSchema from '~/server/db/schemas/auth';
import * as iotSchema from '~/server/db/schemas/iot';
import * as liftingSchema from '~/server/db/schemas/lifting';
import * as mainSchema from '~/server/db/schemas/main';
import * as notificationSchema from '~/server/db/schemas/notification';
import * as observabilitySchema from '~/server/db/schemas/observability';
import * as propSchema from '~/server/db/schemas/prop';
import * as tradingSchema from '~/server/db/schemas/trading';

export enum TransactionStep {
    Begin = 'begin',
    Commit = 'commit',
    Rollback = 'rollback',
}

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

const TRANSACTION_STEPS = new Set<string>(Object.values(TransactionStep));
const WRITE_STATEMENT = /^(?:insert into|update|delete from) "(\w+)"/i;
const READ_STATEMENT = /^select .*? from "(\w+)"/is;
const WHERE_END =
    /\s(?:order by|limit|returning|for update|on conflict|group by)\s/i;

export class FakeDatabaseError extends Error {
    constructor(
        readonly code: string,
        readonly constraint: string,
    ) {
        super(`fake database error ${code} on ${constraint}`);
        this.name = 'FakeDatabaseError';
    }
}

export function assertInsertedForUser(
    query: IssuedQuery,
    userId: string,
): void {
    const owners = insertedColumnValues(query, 'user_id');
    expect(owners.length, query.text).toBeGreaterThan(0);
    for (const owner of owners) expect(owner, query.text).toBe(userId);
}

export function assertUserScopedWhere(
    query: IssuedQuery,
    userId: string,
): void {
    const where = whereClauseOf(query.text);
    expect(where, `no WHERE clause in: ${query.text}`).not.toBeNull();
    const clause = where ?? '';
    expect(clause, `OR in the WHERE clause of: ${query.text}`).not.toMatch(
        /\sor\s/i,
    );
    const matches = clause.matchAll(/"user_id" = \$(\d+)/g).toArray();
    expect(
        matches.length,
        `no "user_id" = $n in the WHERE clause of: ${query.text}`,
    ).toBeGreaterThan(0);
    for (const match of matches) {
        expect(query.params[Number(match[1]) - 1], query.text).toBe(userId);
    }
}

export function createFakeDatabase(responder: Responder) {
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
            ...propSchema,
            ...relationsModule,
        },
    });

    return { database, queries };
}

export function insertedColumnValues(
    query: IssuedQuery,
    column: string,
): unknown[] {
    const match =
        /^insert into "\w+" \((.*?)\) values (.*?)(?:\son conflict\s|\sreturning\s|$)/is.exec(
            query.text,
        );
    if (!match?.[1] || !match[2]) {
        throw new Error(`Not an insert statement: ${query.text}`);
    }
    const columns = splitTopLevel(match[1]).map((name) =>
        name.replaceAll('"', ''),
    );
    const index = columns.indexOf(column);
    if (index === -1) throw new Error(`No column ${column} in ${query.text}`);
    return splitTopLevel(match[2]).map((tuple) => {
        const token = splitTopLevel(tuple.slice(1, -1))[index] ?? '';
        const parameter = /^\$(\d+)$/.exec(token);
        return parameter?.[1] ? query.params[Number(parameter[1]) - 1] : token;
    });
}

export function readTable(query: IssuedQuery): null | string {
    return READ_STATEMENT.exec(query.text)?.[1] ?? null;
}

export function transactionSteps(
    queries: readonly IssuedQuery[],
): TransactionStep[] {
    return queries
        .map((query) => query.text.trim().toLowerCase())
        .filter((text) => TRANSACTION_STEPS.has(text))
        .map((text) => z.enum(TransactionStep).parse(text));
}

export function writeTable(query: IssuedQuery): null | string {
    return WRITE_STATEMENT.exec(query.text)?.[1] ?? null;
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
    const returning = /\sreturning (.*)$/is.exec(text);
    if (returning?.[1] && WRITE_STATEMENT.test(text)) {
        return splitTopLevel(returning[1]);
    }
    const match = /^select (?:distinct on \(.*?\) )?(.*?) from /is.exec(text);
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

function whereClauseOf(text: string): null | string {
    const start = /\swhere\s/i.exec(text);
    if (start === null) return null;
    const rest = text.slice(start.index + start[0].length);
    const end = WHERE_END.exec(rest);
    return end === null ? rest : rest.slice(0, end.index);
}
