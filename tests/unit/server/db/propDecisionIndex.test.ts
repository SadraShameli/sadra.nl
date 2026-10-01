import {
    getTableConfig,
    type IndexedColumn,
    type PgColumn,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { propSizingDecision } from '~/server/db/schemas/prop';

const INDEX_NAME = 'prop_sizing_decision_user_account_decided_idx';

function describedColumns(name: string): string[] {
    const index = getTableConfig(propSizingDecision).indexes.find(
        (candidate) => candidate.config.name === name,
    );
    if (index === undefined) throw new Error(`no index named ${name}`);
    return index.config.columns.map((column) => {
        const indexed = column as IndexedColumn;
        return `${(column as PgColumn).name} ${indexed.indexConfig.order ?? 'asc'} nulls ${indexed.indexConfig.nulls ?? 'last'}`;
    });
}

describe('prop sizing decision index', () => {
    it('orders the latest-decision index newest first with the tie-break columns, matching latestDecisions() DISTINCT ON order', () => {
        expect(describedColumns(INDEX_NAME)).toEqual([
            'user_id asc nulls last',
            'account_id asc nulls last',
            'decided_on desc nulls first',
            'created_at desc nulls first',
            'id desc nulls first',
        ]);
    });
});
