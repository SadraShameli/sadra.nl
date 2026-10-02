import {
    compareText,
    isPaidOnOrBefore,
    paidPayoutCash,
    type PayoutCashFields,
    type StoredFirmId,
    sumUsdCents,
    type UsdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import { addIsoDays, TradingPhase } from '~/lib/prop-calculator';
import {
    type ReconstructedFundedOrEvalAccount,
    retainedCushionForStage,
    type RulebookParameters,
    ruleCappedWithdrawable,
} from '~/lib/prop-calculator/advisor';

import { AccountStateKind, type AccountStateResult } from './AccountStates';
import { fundedPayoutRuleContextOf } from './PayoutReadinessBoard';

export interface ConcentrationAccount {
    readonly accountId: string;
    readonly firmId: StoredFirmId;
    readonly isActive: boolean;
    readonly isStale: boolean;
    readonly movedLiveOn: null | string;
    readonly paidPayouts: readonly PayoutCashFields[];
    readonly state: AccountStateResult;
}

export interface FirmConcentration {
    readonly firmId: StoredFirmId;
    readonly fundedAccounts: number;
    readonly inProfitAccountIds: readonly string[];
    readonly inProfitAccounts: number;
    readonly payoutsSinceLastMovedLive: PayoutsSinceMovedLive;
    readonly recentPayouts: PayoutWindow;
    readonly staleAccounts: number;
    readonly unreadableAccounts: number;
    readonly withdrawableCents: UsdCents;
    readonly withdrawableShare: null | number;
}

export interface FirmConcentrationOptions {
    readonly recentDays: number;
    readonly rulebook: RulebookParameters;
    readonly today: string;
}

export interface FirmProfitConcentration {
    readonly firms: readonly FirmConcentration[];
    readonly recentDays: number;
    readonly retainedCushionDollars: null | number;
    readonly totalInProfitAccounts: number;
    readonly totalWithdrawableCents: UsdCents;
}

export interface PayoutsSinceMovedLive extends PayoutWindow {
    readonly since: null | string;
}

export interface PayoutWindow {
    readonly cents: number;
    readonly count: number;
}

interface FundedFigures {
    readonly isInProfit: boolean;
    readonly withdrawableCents: UsdCents;
}

export function firmProfitConcentrationOf(
    accounts: readonly ConcentrationAccount[],
    options: FirmConcentrationOptions,
): FirmProfitConcentration {
    if (!Number.isSafeInteger(options.recentDays) || options.recentDays < 1) {
        throw new RangeError(
            `the recent payout window must be a whole number of days of at least 1, got ${String(options.recentDays)}`,
        );
    }
    const byFirm = Map.groupBy(accounts, (account) => account.firmId);
    const drafts = byFirm
        .entries()
        .map(([firmId, members]) => draftOf(firmId, members, options))
        .toArray();
    const totalWithdrawableCents = sumUsdCents(
        drafts.map((draft) => draft.withdrawableCents),
    );
    const firms = drafts
        .map((draft): FirmConcentration => ({
            ...draft,
            withdrawableShare:
                totalWithdrawableCents > 0
                    ? draft.withdrawableCents / totalWithdrawableCents
                    : null,
        }))
        .toSorted(
            (a, b) =>
                b.withdrawableCents - a.withdrawableCents ||
                b.inProfitAccounts - a.inProfitAccounts ||
                compareText(a.firmId, b.firmId),
        );
    const sampleFunded =
        accounts
            .filter((account) => account.isActive)
            .map((account) => fundedReconstructedOf(account))
            .find(
                (reconstructed): reconstructed is ReconstructedFundedOrEvalAccount =>
                    reconstructed !== null,
            ) ?? null;
    return {
        firms,
        recentDays: options.recentDays,
        retainedCushionDollars:
            sampleFunded === null
                ? null
                : fundedRetainedCushionDollarsOf(options.rulebook, sampleFunded),
        totalInProfitAccounts: firms.reduce(
            (sum, firm) => sum + firm.inProfitAccounts,
            0,
        ),
        totalWithdrawableCents,
    };
}

export function fundedRetainedCushionDollarsOf(
    rulebook: RulebookParameters,
    account: ReconstructedFundedOrEvalAccount,
): number {
    const { fundedTracker } = account;
    return fundedTracker === null
        ? 0
        : retainedCushionForStage(
              rulebook,
              fundedPayoutRuleContextOf(
                  account.plan,
                  account.state,
                  fundedTracker,
                  null,
              ),
          ).amount;
}

export function fundedWithdrawableDollarsOf(
    rulebook: RulebookParameters,
    account: ReconstructedFundedOrEvalAccount,
): number {
    const { fundedTracker } = account;
    return fundedTracker === null ? 0 : ruleCappedWithdrawable(
        account.plan,
        fundedTracker,
        account.state,
        fundedRetainedCushionDollarsOf(rulebook, account),
    );
}

function draftOf(
    firmId: StoredFirmId,
    members: readonly ConcentrationAccount[],
    options: FirmConcentrationOptions,
): Omit<FirmConcentration, 'withdrawableShare'> {
    const funded = members.flatMap((member) => {
        if (!member.isActive) return [];
        const figures = fundedFiguresOf(member.state, options.rulebook);
        return figures === null ? [] : [{ figures, member }];
    });
    const inProfit = funded.filter(({ figures }) => figures.isInProfit);
    const active = members.filter((member) => member.isActive);
    const payouts = members.flatMap((member) => member.paidPayouts);
    const sinceOn = latestOf(members.map((member) => member.movedLiveOn));
    const windowStart = addIsoDays(options.today, -options.recentDays);
    return {
        firmId,
        fundedAccounts: funded.length,
        inProfitAccountIds: inProfit.map(({ member }) => member.accountId),
        inProfitAccounts: inProfit.length,
        payoutsSinceLastMovedLive: {
            ...windowOf(
                payouts.filter(
                    (payout) =>
                        isPaidOnOrBefore(payout, options.today) &&
                        isAfter(payout.paidOn, sinceOn),
                ),
            ),
            since: sinceOn,
        },
        recentPayouts: windowOf(
            payouts.filter(
                (payout) =>
                    isPaidOnOrBefore(payout, options.today) &&
                    isOnOrAfter(payout.paidOn, windowStart),
            ),
        ),
        staleAccounts: funded.filter(({ member }) => member.isStale).length,
        unreadableAccounts: active.filter(
            (member) => member.state.kind !== AccountStateKind.Reconstructed,
        ).length,
        withdrawableCents: sumUsdCents(
            inProfit.map(({ figures }) => figures.withdrawableCents),
        ),
    };
}

function fundedFiguresOf(
    state: AccountStateResult,
    rulebook: RulebookParameters,
): FundedFigures | null {
    if (state.kind !== AccountStateKind.Reconstructed) return null;
    const { reconstructed } = state.latest;
    if (reconstructed.kind !== TradingPhase.Funded) return null;
    return {
        isInProfit: reconstructed.plan.accountProfit(reconstructed.state) > 0,
        withdrawableCents: usdCentsFromDollars(
            fundedWithdrawableDollarsOf(rulebook, reconstructed),
        ),
    };
}

function fundedReconstructedOf(
    account: ConcentrationAccount,
): null | ReconstructedFundedOrEvalAccount {
    const { state } = account;
    if (state.kind !== AccountStateKind.Reconstructed) return null;
    const { reconstructed } = state.latest;
    return reconstructed.kind === TradingPhase.Funded ? reconstructed : null;
}

function isAfter(paidOn: null | string, sinceOn: null | string): boolean {
    return (
        sinceOn === null ||
        (paidOn !== null && compareText(paidOn, sinceOn) > 0)
    );
}

function isOnOrAfter(paidOn: null | string, start: string): boolean {
    return paidOn !== null && compareText(paidOn, start) >= 0;
}

function latestOf(dates: readonly (null | string)[]): null | string {
    return dates.reduce<null | string>(
        (latest, date) =>
            date !== null && (latest === null || compareText(date, latest) > 0)
                ? date
                : latest,
        null,
    );
}

function windowOf(payouts: readonly PayoutCashFields[]): PayoutWindow {
    const cash = payouts.flatMap((payout) => {
        const entry = paidPayoutCash(payout);
        return entry === null ? [] : [entry.cents];
    });
    return { cents: sumUsdCents(cash), count: cash.length };
}
