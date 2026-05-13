import { z } from 'zod';

export const sessionUserIdSchema = z.string().min(1);

export const sessionUserSchema = z.object({
    id: sessionUserIdSchema,
    name: z.string().nullable().optional(),
    email: z.email().nullable().optional(),
    image: z.string().nullable().optional(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export const credentialsSchema = z.object({
    email: z.email().toLowerCase(),
    password: z.string().min(1).max(256),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;

export const jwtTokenSchema = z
    .object({
        id: sessionUserIdSchema.optional(),
    })
    .passthrough();

export type JwtToken = z.infer<typeof jwtTokenSchema>;
