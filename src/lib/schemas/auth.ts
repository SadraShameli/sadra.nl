import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    accounts,
    passwordResetTokens,
    sessions,
    users,
    verificationTokens,
} from '~/server/db/schemas/auth';

export const emailSchema = z.email().max(256).toLowerCase();

export const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(256);

export const displayNameSchema = z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(256);

export const userRowSchema = createSelectSchema(users);
export type UserRow = z.infer<typeof userRowSchema>;

export const userInsertSchema = createInsertSchema(users, {
    email: emailSchema,
});
export type UserInsert = z.infer<typeof userInsertSchema>;

export const passwordResetTokenRowSchema =
    createSelectSchema(passwordResetTokens);
export type PasswordResetTokenRow = z.infer<typeof passwordResetTokenRowSchema>;

export const accountRowSchema = createSelectSchema(accounts);
export type AccountRow = z.infer<typeof accountRowSchema>;

export const sessionRowSchema = createSelectSchema(sessions);
export type SessionRow = z.infer<typeof sessionRowSchema>;

export const verificationTokenRowSchema =
    createSelectSchema(verificationTokens);
export type VerificationTokenRow = z.infer<typeof verificationTokenRowSchema>;

export const loginInputSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(256),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const signupInputSchema = z
    .object({
        name: displayNameSchema,
        email: emailSchema,
        password: passwordSchema,
        confirm: z.string(),
    })
    .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
    });

export type SignupInput = z.infer<typeof signupInputSchema>;

export const forgotPasswordInputSchema = z.object({
    email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

export const magicLinkInputSchema = z.object({
    email: emailSchema,
});

export type MagicLinkInput = z.infer<typeof magicLinkInputSchema>;

export const resetPasswordInputSchema = z
    .object({
        token: z.string().min(1, 'Reset token is required'),
        password: passwordSchema,
        confirm: z.string(),
    })
    .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
    });

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const updateNameInputSchema = z
    .object({
        name: displayNameSchema,
        currentName: z.string(),
    })
    .refine((data) => data.name !== data.currentName.trim(), {
        message: 'No changes to save',
        path: ['name'],
    });

export type UpdateNameInput = z.infer<typeof updateNameInputSchema>;

export const updatePasswordInputSchema = z
    .object({
        current: z.string().min(1, 'Current password is required').max(256),
        password: passwordSchema,
        confirm: z.string(),
    })
    .refine((data) => data.password === data.confirm, {
        message: 'Passwords do not match',
        path: ['confirm'],
    });

export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;
