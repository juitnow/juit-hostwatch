import { never } from 'justus'

import { AbstractSink } from './abstract'

import type { Metric } from '../types'

export class ConsoleSink extends AbstractSink<typeof never> {
  constructor() {
    super('console', never)
  }

  sink({ name, value, unit, dimensions }: Metric): void {
    this.log.info(`Sinking metric ${name}:`, value, `[${unit}]`)
    const length = Object.keys(dimensions).reduce((l, s) => s.length > l ? s.length : l, 0)
    Object.entries(dimensions).forEach(([ name, value ], i, a) => {
      const [ line, dash ] = (i + 1) == a.length ? [ ' \u2514\u2500', '\u2500' ] : [ ' \u2502 ', ' ' ]
      this.log.info(line + `   ${name}`.padStart(length + 3, dash), '=>', value)
    })
  }
}
