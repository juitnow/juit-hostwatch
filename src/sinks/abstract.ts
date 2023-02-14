import { AbstractComponent } from '../component'

import type { Validation } from 'justus'
import type { Metric, Sink, SinkDefinition } from '..'

export abstract class AbstractSink<V extends Validation> extends AbstractComponent<V> implements Sink {
  protected constructor(name: string, validation: V) {
    super('sink', name, validation)
  }

  init(def: SinkDefinition): void | Promise<void> {
    super.initialize(def)
  }

  abstract sink(metric: Metric): void
}
