import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DetailList, type DetailListItem } from '~/components/DetailList';

import {
    type AccountFromStateModel,
    MilestoneValueViewKind,
} from './accountFromStateModel';

export function AccountFromStateDetails({
    model,
}: {
    readonly model: AccountFromStateModel;
}) {
    const { milestone } = model;
    return (
        <div className="flex flex-col gap-3">
            <DetailList items={detailItemsOf(model)} />
            {milestone.gates.length > 0 && (
                <ul
                    aria-label="Gates not met at the milestone"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-warning"
                >
                    {milestone.gates.map((gate) => (
                        <li key={gate}>{gate}</li>
                    ))}
                </ul>
            )}
            {model.liveTransferNotes.length > 0 && (
                <ul
                    aria-label="Live-transfer and payout-trigger assumptions behind the figures from this state"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    {model.liveTransferNotes.map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-muted-foreground">
                {model.startBasis}; {model.trials}. {model.creditBasis}
            </p>
        </div>
    );
}

function detailItemsOf(
    model: AccountFromStateModel,
): readonly DetailListItem[] {
    const { milestone, nextPayout, value } = model;
    return [
        {
            id: 'value-credit-free',
            label: 'Value from this state, credit-free',
            value: value.creditFree,
        },
        {
            id: 'value-credit-inclusive',
            label: 'Value from this state, with end-of-horizon credit',
            value: value.creditInclusive,
        },
        ...(milestone.value.kind === MilestoneValueViewKind.Value
            ? [
                  {
                      id: 'milestone-value',
                      label: milestone.label,
                      value: `${milestone.value.creditFree} credit-free; ${milestone.value.creditInclusive} with credit`,
                  },
                  {
                      id: 'milestone-gain',
                      label: 'Credit-free gain from the milestone',
                      value: milestone.value.gain,
                  },
              ]
            : [
                  {
                      id: 'milestone-value',
                      label: milestone.label,
                      value: (
                          <span className="text-warning">
                              {milestone.value.text}
                          </span>
                      ),
                  },
              ]),
        ...(milestone.debited === null
            ? []
            : [
                  {
                      id: 'milestone-debited',
                      label: 'Payout requested at the milestone',
                      value: milestone.debited,
                  },
              ]),
        ...(milestone.received === null
            ? []
            : [
                  {
                      id: 'milestone-received',
                      label: 'Cash you receive from that payout',
                      value: milestone.received,
                  },
              ]),
        ...(nextPayout === null
            ? []
            : [
                  {
                      id: 'next-payout-time',
                      label: 'Expected time to the next payout',
                      value: `${nextPayout.calendarDays}; ${nextPayout.sessionDays}`,
                  },
                  {
                      id: 'next-payout-account-lost',
                      label: 'Chance the account is lost before the next payout',
                      value: (
                          <FigureText
                              text={nextPayout.accountLostBeforePayout}
                          />
                      ),
                  },
                  {
                      id: 'next-payout-breach',
                      label: 'Chance the next payout itself causes the breach',
                      value: nextPayout.breachAtFirstPayout,
                  },
                  {
                      id: 'next-payout-reset-fee',
                      label: 'Expected reset fees before the next payout',
                      value: nextPayout.resetFee,
                  },
                  {
                      id: 'next-payout-paying-trials',
                      label: 'Trials that reached a payout',
                      value: nextPayout.payingTrials,
                  },
              ]),
    ];
}
