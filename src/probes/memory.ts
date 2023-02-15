import { freemem, totalmem } from 'node:os'

import { never } from 'justus'

import { Unit } from '../types'
import { AbstractProbe, percent } from './abstract'

import type { PollData } from './abstract'

const metrics = {
  MemoryUsed: Unit.Gigabytes,
  MemoryFree: Unit.Gigabytes,
  MemoryPerc: Unit.Percent,
} as const

export class MemoryProbe extends AbstractProbe<typeof metrics, typeof never> {
  constructor() {
    super('load', metrics, never)
  }

  protected sample(): PollData<typeof metrics> {
    const total = totalmem()
    const free = freemem()
    const used = total - free

    return {
      MemoryUsed: used / 1073741824,
      MemoryFree: free / 1073741824,
      MemoryPerc: percent(used, total),
    }
  }
}
