// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
export default tseslint.config(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
);
