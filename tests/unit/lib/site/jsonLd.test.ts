import { describe, expect, it } from 'vitest';

import { serializeJsonLd } from '~/lib/site/jsonLd';

describe('serializeJsonLd', () => {
    it('escapes every < so a value cannot close the script element', () => {
        const serialized = serializeJsonLd({
            name: '</script><script>alert(1)</script>',
        });
        expect(serialized).not.toContain('<');
        expect(serialized).toContain(String.raw`\u003c/script>`);
    });

    it('still parses back to the original value', () => {
        const value = {
            '@type': 'Person',
            name: 'a < b </script>',
            sameAs: ['https://example.com'],
        };
        expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
    });
});
