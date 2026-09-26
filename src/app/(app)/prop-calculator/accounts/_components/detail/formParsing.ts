import { z } from 'zod';

export function nullIfBlank(text: string): null | string {
    return text.trim() === '' ? null : text;
}

export function parsedOrIssues<Output>(
    parsed: z.ZodSafeParseResult<Output>,
    context: z.RefinementCtx,
): Output {
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
        context.addIssue({
            code: 'custom',
            message: issue.message,
            path: [...issue.path],
        });
    }
    return z.NEVER;
}
