import { z } from 'zod';

export const sessionUserIdSchema = z.string().min(1);

export const sessionUserSchema = z.object({
    email: z.email().nullable().optional(),
    id: sessionUserIdSchema,
    image: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export const credentialsSchema = z.object({
    email: z.email().toLowerCase(),
    password: z.string().min(1).max(256),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;

export const jwtTokenSchema = z.looseObject({
    id: sessionUserIdSchema.optional(),
});

export type JwtToken = z.infer<typeof jwtTokenSchema>;
