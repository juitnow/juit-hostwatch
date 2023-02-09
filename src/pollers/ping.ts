import { createPinger } from '@juit/lib-ping'
import { number, object, oneOf, optional, string } from 'justus'

import { AbstractPoller } from '../poller'
import { Unit } from '../index'

import type { PollerData } from '../poller'
import type { InferValidation } from 'justus'
import type { Pinger } from '@juit/lib-ping'

const metrics = {
  'PingLatency': Unit.Milliseconds,
  'PingPacketLoss': Unit.Percent,
} as const

const validator = object({
  to: string({ minLength: 1 }),
  from: optional(string({ minLength: 1 })),
  interval: optional(number({ minimum: 1000 })),
  timeout: optional(number({ minimum: 1000 })),
  protocol: optional(oneOf('ipv4', 'ipv6')),
} as const)

export class PingPoller extends AbstractPoller<typeof metrics, typeof validator> {
  private _pinger?: Pinger

  constructor() {
    super('ping', metrics, validator)
  }

  async init(config: InferValidation<typeof validator>): Promise<void> {
    const { to, ...options } = config

    this._pinger = await createPinger(to, options)
    this._pinger.start()
  }

  async sample(): Promise<PollerData<typeof metrics>> {
    if (! this._pinger) throw new Error('PingPoller not initialized')

    const stats = this._pinger.stats()
    if (stats.sent < 1) return {}

    const loss = 100 - (stats.received * 100) / stats.sent

    return {
      PingLatency: stats.latency,
      PingPacketLoss: loss,
    }
  }
}
