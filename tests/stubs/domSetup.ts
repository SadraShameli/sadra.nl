import type * as ReactQuery from '@tanstack/react-query';

import { vi } from 'vitest';

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { trpcDoubleQuery } = await import('./trpcDouble');
    return trpcDoubleQuery(await importOriginal<typeof ReactQuery>());
});
