import {
    getTableConfig,
    type IndexedColumn,
    type PgColumn,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { propRuleViolation } from '~/server/db/schemas/prop';

const INDEX_NAME = 'prop_rule_violation_user_occurred_idx';

function describedColumns(name: string): string[] {
    const index = getTableConfig(propRuleViolation).indexes.find(
        (candidate) => candidate.config.name === name,
    );
    if (index === undefined) throw new Error(`no index named ${name}`);
    return index.config.columns.map((column) => {
        const indexed = column as IndexedColumn;
        return `${(column as PgColumn).name} ${indexed.indexConfig.order ?? 'asc'}`;
    });
}

describe('prop rule violation indexes', () => {
    it('indexes the owner and the occurrence date so a date-bounded list across every account does not scan the owner rows', () => {
        expect(describedColumns(INDEX_NAME)).toEqual([
            'user_id asc',
            'occurred_on asc',
        ]);
    });
});
