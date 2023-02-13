import { createPinger } from '@juit/lib-ping'
import { number, object, oneOf, optional, string } from 'justus'

import { AbstractProbe } from '../probe'
import { Unit } from '../index'

import type { PollData } from '../probe'
import type { InferValidation } from 'justus'
import type { Pinger } from '@juit/lib-ping'

const metrics = {
  'PingLatency': Unit.Milliseconds,
  'PingPacketLoss': Unit.Percent,
} as const

const validator = object({
  to: string({ minLength: 1 }),
  from: optional(string({ minLength: 1 })),
  interval: optional(number({ minimum: 1000, fromString: true })),
  timeout: optional(number({ minimum: 1000, fromString: true })),
  protocol: optional(oneOf('ipv4', 'ipv6')),
} as const)

export class PingProbe extends AbstractProbe<typeof metrics, typeof validator> {
  private _pinger?: Pinger

  constructor() {
    super('ping', metrics, validator)
  }

  async init(config: InferValidation<typeof validator>): Promise<void> {
    const { to, ...options } = config

    this.log.debug(`Crating pinger to "${to}":`, options)

    this._pinger = await createPinger(to, options)
    this._pinger.on('pong', (ms) => this.log.trace(`Pong from "${to}"`, ms, 'ms'))
    this._pinger.on('error', (err) => this.log.error(`Error pinging "${to}"`, err))
    this._pinger.start()
  }

  async sample(): Promise<PollData<typeof metrics>> {
    if (! this._pinger) throw new Error('PingProbe not initialized')

    const stats = this._pinger.stats()
    if (stats.sent < 1) return {}

    const loss = 100 - (stats.received * 100) / stats.sent

    return {
      PingLatency: stats.latency,
      PingPacketLoss: loss,
    }
  }
}
