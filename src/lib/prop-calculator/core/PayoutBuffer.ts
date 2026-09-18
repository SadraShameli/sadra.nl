import { type Dollars, dollars } from './lib/units';

export class PayoutBuffer {
    constructor(private readonly offset: Dollars) {}

    requiredBalance(
        startingBalance: Dollars,
        drawdownAmount: Dollars,
    ): Dollars {
        return dollars(startingBalance + drawdownAmount + this.offset);
    }
}
