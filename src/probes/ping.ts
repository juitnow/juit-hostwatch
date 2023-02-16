import { createPinger } from '@juit/lib-ping'
import { object, oneOf, optional, string } from 'justus'

import { Unit } from '../types'
import { millis } from '../utils/milliseconds'
import { percent } from '../utils/percent'
import { AbstractProbe } from './abstract'

import type { Pinger } from '@juit/lib-ping'
import type { PollData } from './abstract'

const metrics = {
  'PingLatency': Unit.Milliseconds,
  'PingPacketLoss': Unit.Percent,
} as const

const validator = object({
  to: string({ minLength: 1 }),
  from: optional(string({ minLength: 1 })),
  source: optional(string({ minLength: 1 })),
  interval: optional(millis({ minimum: 1000, defaultUnit: 'seconds' }), '5 sec'),
  timeout: optional(millis({ minimum: 1000, defaultUnit: 'seconds' }), '30 sec'),
  protocol: optional(oneOf('ipv4', 'ipv6')),
} as const)

export class PingProbe extends AbstractProbe<typeof metrics, typeof validator> {
  private _pinger?: Pinger

  constructor() {
    super('ping', metrics, validator)
  }

  async start(): Promise<void> {
    const { to, ...conf } = this.configuration

    this.log.debug(`Crating pinger to "${to}":`, conf)
    this._pinger = await createPinger(to, conf)

    this._pinger.on('pong', (ms) => this.log.trace(`Pong from "${to}"`, ms, 'ms'))
    this._pinger.on('error', (err) => this.log.error(`Error pinging "${to}"`, err))
    this._pinger.on('warning', (c, msg) => this.log.debug(`Ping warning (code=${c}): ${msg}`))

    this._pinger.start()
  }

  async stop(): Promise<void> {
    if (this._pinger) await this._pinger.close()
  }

  protected async sample(): Promise<PollData<typeof metrics>> {
    if (! this._pinger) throw new Error('PingProbe not initialized')

    const { sent, received, latency } = this._pinger.stats()
    if (sent < 1) return {}

    const loss = 100 - percent(received, sent)

    return {
      PingLatency: latency,
      PingPacketLoss: loss,
    }
  }
}
