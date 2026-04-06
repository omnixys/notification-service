import { Injectable, OnModuleInit } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache';

@Injectable()
export class GraphQLPubSubAdapter implements OnModuleInit {
  private handlers = new Map<string, Function[]>();

  constructor(private readonly valkeyPubSub: ValkeyPubSubService) {}

  async onModuleInit() {
    // subscribe to channel once
    await this.valkeyPubSub.subscribe('whatsapp.message', async (payload) => {
      const handlers = this.handlers.get('whatsapp.message') ?? [];

      for (const handler of handlers) {
        await handler(payload);
      }
    });
  }

  async publish(trigger: string, payload: any) {
    await this.valkeyPubSub.publish(trigger, payload);
  }

  asyncIterator(trigger: string) {
    return {
      [Symbol.asyncIterator]: () => {
        const queue: any[] = [];
        let resolve: any;

        const push = (value: any) => {
          if (resolve) {
            resolve({ value, done: false });
            resolve = null;
          } else {
            queue.push(value);
          }
        };

        const pull = () =>
          new Promise((res) => {
            if (queue.length > 0) {
              res({ value: queue.shift(), done: false });
            } else {
              resolve = res;
            }
          });

        const handlers = this.handlers.get(trigger) ?? [];
        handlers.push(push);
        this.handlers.set(trigger, handlers);

        return {
          next: pull,
          return: async () => ({ value: undefined, done: true }),
          throw: async (error: any) => {
            throw error;
          },
        };
      },
    };
  }
}
