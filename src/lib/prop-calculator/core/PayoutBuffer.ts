import { type Dollars, dollars } from './units';

export class PayoutBuffer {
    constructor(private readonly offset: Dollars) {}

    requiredBalance(
        startingBalance: Dollars,
        drawdownAmount: Dollars,
    ): Dollars {
        return dollars(startingBalance + drawdownAmount + this.offset);
    }
}
