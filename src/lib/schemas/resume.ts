import { z } from 'zod';

export const resumeNameSchema = z.object({ name: z.enum(['sadra']) });
export const resumeSearchSchema = z.object({
    cover: z.string().optional(),
    download: z.literal('1').optional(),
    variant: z.enum(['fullstack', 'quant']).optional(),
});

export type ResumeName = z.infer<typeof resumeNameSchema>['name'];
export type ResumeSearch = z.infer<typeof resumeSearchSchema>;
