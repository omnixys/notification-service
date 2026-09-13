import { Injectable } from '@nestjs/common';
import type { GuestMagicLinkChannel } from '@omnixys/contracts-ts';

@Injectable()
export class GuestMagicLinkMetricsService {
  private dispatched = 0;
  private failures = 0;
  private readonly byChannel: Record<GuestMagicLinkChannel, number> = {
    EMAIL: 0,
    WHATSAPP: 0,
  };
  private readonly failuresByChannel: Record<GuestMagicLinkChannel, number> = {
    EMAIL: 0,
    WHATSAPP: 0,
  };

  recordDispatch(channel: GuestMagicLinkChannel): void {
    this.dispatched += 1;
    this.byChannel[channel] += 1;
  }

  recordFailure(channel: GuestMagicLinkChannel): void {
    this.failures += 1;
    this.failuresByChannel[channel] += 1;
  }

  snapshot() {
    return {
      dispatched: this.dispatched,
      failures: this.failures,
      byChannel: { ...this.byChannel },
      failuresByChannel: { ...this.failuresByChannel },
    };
  }
}
