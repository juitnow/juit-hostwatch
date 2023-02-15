import { stat } from 'node:fs/promises'

import { statvfs } from '@juit/lib-statvfs'
import { object, optional, string } from 'justus'


import { Unit } from '../types'
import { percentBig } from '../utils/percent'
import { AbstractProbe } from './abstract'

import type { PollData } from './abstract'

const metrics = {
  DiskUsed: Unit.Gigabytes,
  DiskFree: Unit.Gigabytes,
  DiskPerc: Unit.Percent,
} as const

const validator = optional(object({
  path: optional(string({ minLength: 1 }), '/'),
} as const), {})

export class DiskProbe extends AbstractProbe<typeof metrics, typeof validator> {
  private _disk: string

  constructor() {
    super('disk', metrics, validator)
    this._disk = '/'
  }

  async start(): Promise<void> {
    if (this.configuration) this._disk = this.configuration.path

    if ((await stat(this._disk)).isDirectory()) return

    throw new Error(`Specified path "${this._disk}" is not a directory`)
  }

  protected async sample(): Promise<PollData<typeof metrics>> {
    const {
      bytes_available: avail, // use "avail" (to non super users)
      bytes_total: total,
    } = await statvfs(this._disk)
    const used = total - avail

    return {
      DiskUsed: Number(used / 1048576n) / 1024,
      DiskFree: Number(avail / 1048576n) / 1024,
      DiskPerc: percentBig(used, total),
    }
  }
}
