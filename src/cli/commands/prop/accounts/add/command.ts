import { defineCommand } from 'citty';

import {
    accountsAddPortOf,
    addAccounts,
    readFeeChoice,
} from '~/cli/commands/prop/accounts/add/AccountsAdd';
import { propAccountsCallerFor } from '~/cli/commands/prop/accounts/PropAccountsCaller';
import {
    planArguments,
    planResolver,
    readPositiveInteger,
} from '~/cli/commands/prop/shared';
import {
    findUserByEmail,
    readUserEmail,
} from '~/cli/commands/prop/userByEmail';
import { ui } from '~/cli/ui';
import {
    AccountStage,
    formatUsdCents,
    todayIsoDate,
} from '~/lib/prop-accounts/core';

const command = defineCommand({
    args: {
        ...planArguments,
        count: {
            default: '1',
            description: 'How many accounts of this plan to add',
            type: 'string',
        },
        fee: {
            default: 'list',
            description:
                "Purchase fee per account: 'list' (the plan's list price for its default fee kind), 'none', or a dollar amount you paid",
            type: 'string',
        },
        'funded-on': {
            description: 'Funded date, YYYY-MM-DD (needed for --stage funded)',
            type: 'string',
        },
        label: {
            description:
                "Label prefix; accounts are numbered after the ones you already have (default: the plan's label)",
            type: 'string',
        },
        'purchased-on': {
            description: 'Purchase date, YYYY-MM-DD (default: today)',
            type: 'string',
        },
        stage: {
            default: AccountStage.Eval,
            description: `Account stage: ${Object.values(AccountStage).join(', ')}`,
            options: Object.values(AccountStage),
            type: 'enum',
        },
        'user-email': {
            description:
                'The account owner, by email: the accounts are created as that user, through the same checks as the web app',
            required: true,
            type: 'string',
        },
    },
    meta: {
        description:
            'Add accounts of one plan to your tracked prop accounts, each with its purchase fee',
        name: 'add',
    },
    async run(context) {
        try {
            const { args } = context;
            const email = readUserEmail(args['user-email']);
            if (email === null) throw new Error('--user-email is required');
            const plan = planResolver.resolveOne(args);
            const request = {
                count: readPositiveInteger(args.count, 'count'),
                fee: readFeeChoice(args.fee),
                fundedOn: args['funded-on'] ?? null,
                label: args.label ?? plan.label,
                plan,
                purchasedOn: args['purchased-on'] ?? todayIsoDate(new Date()),
                stage: args.stage,
            };
            const { db, endDb } = await import('~/server/db');
            try {
                const owner = await findUserByEmail(db, email);
                const added = await addAccounts(
                    accountsAddPortOf(propAccountsCallerFor(db, owner)),
                    request,
                );
                for (const account of added) {
                    ui.success(
                        `${account.label}  ${account.planSerial ?? 'no plan'}  ${account.stage}  ${account.fee === null ? 'no fee' : `${account.fee.kind} ${formatUsdCents(account.fee.amountCents)}`}`,
                    );
                }
                ui.muted(`${String(added.length)} account(s) added`);
            } finally {
                await endDb();
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export default command;
