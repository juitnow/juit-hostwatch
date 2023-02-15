import { cpus } from 'node:os'

import { never } from 'justus'

import { Unit } from '../types'
import { AbstractProbe, percent } from './abstract'

import type { PollData } from './abstract'


const metrics = {
  CpuIdleTime: Unit.Milliseconds,
  CpuUserTime: Unit.Milliseconds,
  CpuNiceTime: Unit.Milliseconds,
  CpuSystemTime: Unit.Milliseconds,
  CpuIrqTime: Unit.Milliseconds,
  CpuBusyTime: Unit.Milliseconds,

  CpuIdlePerc: Unit.Percent,
  CpuUserPerc: Unit.Percent,
  CpuNicePerc: Unit.Percent,
  CpuSystemPerc: Unit.Percent,
  CpuIrqPerc: Unit.Percent,
  CpuBusyPerc: Unit.Milliseconds,
} as const

interface State {
  user: number
  nice: number
  sys: number
  idle: number
  irq: number
}

export class CPUProbe extends AbstractProbe<typeof metrics, typeof never> {
  private _state?: State

  constructor() {
    super('cpu', metrics, never)
  }

  protected sample(): PollData<typeof metrics> {
    const state: State = cpus().reduce((timings, { times }) => {
      timings.idle += times.idle
      timings.nice += times.nice
      timings.user += times.user
      timings.irq += times.irq
      timings.sys += times.sys
      return timings
    }, {
      idle: 0,
      nice: 0,
      user: 0,
      irq: 0,
      sys: 0,
    })

    if (! this._state) {
      this.log.debug('No previous state (first run?)')
      this._state = state
      return {}
    }

    // these will be %ages against "total"
    const idle = state.idle - this._state.idle
    const nice = state.nice - this._state.nice
    const user = state.user - this._state.user
    const irq = state.irq - this._state.irq
    const sys = state.sys - this._state.sys
    const busy = nice + user + irq + sys
    const total = busy + idle

    // remember to save our state
    this._state = state

    // return all our metrics data
    return {
      'CpuIdleTime': idle,
      'CpuUserTime': user,
      'CpuNiceTime': nice,
      'CpuSystemTime': sys,
      'CpuIrqTime': irq,
      'CpuBusyTime': busy,

      'CpuIdlePerc': percent(idle, total),
      'CpuUserPerc': percent(user, total),
      'CpuNicePerc': percent(nice, total),
      'CpuSystemPerc': percent(sys, total),
      'CpuIrqPerc': percent(irq, total),
      'CpuBusyPerc': percent(busy, total),
    }
  }
}
