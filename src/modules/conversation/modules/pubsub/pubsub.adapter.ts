import { Injectable, OnModuleInit } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache';

type PubSubHandler = (payload: unknown) => Promise<void> | void;
type IteratorResultResolver = (
  result: IteratorResult<unknown, undefined>,
) => void;

@Injectable()
export class GraphQLPubSubAdapter implements OnModuleInit {
  private handlers = new Map<string, PubSubHandler[]>();

  constructor(private readonly valkeyPubSub: ValkeyPubSubService) {}

  async onModuleInit(): Promise<void> {
    // subscribe to channel once
    await this.valkeyPubSub.subscribe('whatsapp.message', async (payload) => {
      const handlers = this.handlers.get('whatsapp.message') ?? [];

      for (const handler of handlers) {
        await handler(payload);
      }
    });
  }

  async publish(trigger: string, payload: unknown): Promise<void> {
    await this.valkeyPubSub.publish(trigger, payload);
  }

  asyncIterator(trigger: string): AsyncIterableIterator<unknown> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterableIterator<unknown> => {
        const queue: unknown[] = [];
        let resolve: IteratorResultResolver | undefined;

        const push = (value: unknown): void => {
          if (resolve) {
            resolve({ value, done: false });
            resolve = undefined;
          } else {
            queue.push(value);
          }
        };

        const pull = (): Promise<IteratorResult<unknown, undefined>> =>
          new Promise<IteratorResult<unknown, undefined>>((res) => {
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
          return: async (): Promise<IteratorResult<unknown, undefined>> => ({
            value: undefined,
            done: true,
          }),
          throw: async (
            error?: unknown,
          ): Promise<IteratorResult<unknown, undefined>> => {
            throw error;
          },
          [Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
            return this;
          },
        };
      },
      next: async (): Promise<IteratorResult<unknown, undefined>> => ({
        value: undefined,
        done: true,
      }),
      return: async (): Promise<IteratorResult<unknown, undefined>> => ({
        value: undefined,
        done: true,
      }),
      throw: async (
        error?: unknown,
      ): Promise<IteratorResult<unknown, undefined>> => {
        throw error;
      },
    };
  }
}
