import { is } from 'drizzle-orm';
import {
    getTableConfig,
    type IndexedColumn,
    PgTable,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { databaseSchema } from '~/server/db/databaseSchema';
import { verification } from '~/server/db/schemas/auth';
import { reading } from '~/server/db/schemas/iot';

const tables: PgTable[] = [];
for (const value of Object.values(databaseSchema)) {
    if (is(value, PgTable)) tables.push(value);
}

function indexColumns(table: PgTable): string[][] {
    return getTableConfig(table).indexes.map((index) =>
        index.config.columns.map(
            (column) => (column as IndexedColumn).name ?? '',
        ),
    );
}

function isCoveredBy(foreignKey: string[], index: string[]): boolean {
    const prefix = new Set(index.slice(0, foreignKey.length));
    return (
        prefix.size === foreignKey.length &&
        foreignKey.every((column) => prefix.has(column))
    );
}

function leadingColumns(table: PgTable): string[][] {
    const config = getTableConfig(table);
    const indexed = config.indexes.map((index) =>
        index.config.columns.map(
            (column) => (column as IndexedColumn).name ?? '',
        ),
    );
    const unique = config.columns
        .filter((column) => column.isUnique || column.primary)
        .map((column) => [column.name]);
    const keyed = [
        ...config.primaryKeys.map((key) => key.columns.map((c) => c.name)),
        ...config.uniqueConstraints.map((key) =>
            key.columns.map((c) => c.name),
        ),
    ];
    return [...indexed, ...unique, ...keyed];
}

function uncoveredForeignKeys(): string[] {
    return tables.flatMap((table) => {
        const config = getTableConfig(table);
        const indexes = leadingColumns(table);
        return config.foreignKeys
            .map((foreignKey) =>
                foreignKey.reference().columns.map((column) => column.name),
            )
            .filter(
                (columns) =>
                    indexes.every((index) => !isCoveredBy(columns, index)),
            )
            .map((columns) => `${config.name}(${columns.join(', ')})`);
    });
}

describe('database indexes', () => {
    it('backs every foreign key with an index that leads with its columns', () => {
        expect(uncoveredForeignKeys()).toEqual([]);
    });

    it('serves reading range queries by location and by time', () => {
        expect(indexColumns(reading)).toEqual(
            expect.arrayContaining([
                ['location_id', 'created_at'],
                ['created_at'],
            ]),
        );
    });

    it('looks up Better Auth verification values by identifier', () => {
        expect(indexColumns(verification)).toContainEqual(['identifier']);
    });
});
