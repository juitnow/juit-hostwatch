import { cpus, loadavg } from 'node:os'

import { never } from 'justus'

import { Unit } from '../types'
import { AbstractProbe } from './abstract'

import type { PollData } from './abstract'

const metrics = {
  Load1m: Unit.None,
  Load5m: Unit.None,
  Load15m: Unit.None,
  LoadAverage1m: Unit.None,
  LoadAverage5m: Unit.None,
  LoadAverage15m: Unit.None,
} as const

export class LoadProbe extends AbstractProbe<typeof metrics, typeof never> {
  constructor() {
    super('load', metrics, never)
  }

  protected sample(): PollData<typeof metrics> {
    const [ load1m, load5m, load15m ] = loadavg()
    const cpuCount = cpus().length
    return {
      LoadAverage1m: load1m,
      LoadAverage5m: load5m,
      LoadAverage15m: load15m,
      Load1m: load1m / cpuCount,
      Load5m: load5m / cpuCount,
      Load15m: load15m / cpuCount,
    }
  }
}
