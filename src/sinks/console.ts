import { never } from 'justus'

import { AbstractSink } from './abstract'

import type { Metric } from '..'

export class ConsoleSink extends AbstractSink<typeof never> {
  constructor() {
    super('console', never)
  }

  sink(metric: Metric): void {
    this.log.info('Sinking metric', metric.name, '=>', metric.value, `[${metric.unit}]`)
  }
}
