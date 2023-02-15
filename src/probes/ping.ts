import { createPinger } from '@juit/lib-ping'
import { number, object, oneOf, optional, string } from 'justus'

import { Unit } from '../index'
import { AbstractProbe, percent } from './abstract'

import type { Pinger, PingerOptions } from '@juit/lib-ping'
import type { InferValidation } from 'justus'
import type { PollData } from './abstract'

const metrics = {
  'PingLatency': Unit.Milliseconds,
  'PingPacketLoss': Unit.Percent,
} as const

const validator = object({
  to: string({ minLength: 1 }),
  from: optional(string({ minLength: 1 })),
  interval: optional(number({ minimum: 1000, fromString: true }), 5000),
  timeout: optional(number({ minimum: 1000, fromString: true }), 30000),
  protocol: optional(oneOf('ipv4', 'ipv6')),
} as const)

export class PingProbe extends AbstractProbe<typeof metrics, typeof validator> {
  private _to?: string
  private _conf?: PingerOptions
  private _pinger?: Pinger

  constructor() {
    super('ping', metrics, validator)
  }

  protected configure(config: InferValidation<typeof validator>): void {
    const { to, ...conf } = config
    this._to = to
    this._conf = conf
  }

  async start(): Promise<void> {
    if (! this._to) throw new Error('PingProbe not configured')

    this.log.debug(`Crating pinger to "${this._to}":`, this._conf)
    this._pinger = await createPinger(this._to, this._conf)

    this._pinger.on('pong', (ms) => this.log.trace(`Pong from "${this._to}"`, ms, 'ms'))
    this._pinger.on('error', (err) => this.log.error(`Error pinging "${this._to}"`, err))

    this._pinger.start()
  }

  async stop(): Promise<void> {
    if (! this._pinger) throw new Error('PingProbe not initialized')
    await this._pinger.close()
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
