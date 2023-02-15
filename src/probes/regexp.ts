import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { array, object, oneOf, optional, string, url } from 'justus'

import { units } from '../types'
import { AbstractProbe } from './abstract'

import type { PollData, ProbeMetrics } from './abstract'

const expressionValidator = oneOf(
    string,
    object({
      pattern: string({ minLength: 1 }),
      replace: optional(string({ minLength: 1 }), '$0'),
    }),
)

const metricValidator = object({
  name: string({ minLength: 1 }),
  unit: optional(oneOf(...units), 'None'),
  expr: oneOf(
      string({ minLength: 1 }),
      array({ items: expressionValidator, minItems: 1 }),
  ),
})

const validator = object({
  source: url,
  metrics: array({ items: metricValidator, minItems: 1 }),
})

export class RegExpProbe extends AbstractProbe<ProbeMetrics, typeof validator> {
  constructor() {
    super('regex', {}, validator)
  }

  protected configure(def: { name?: string | undefined; config?: any }): void {
    super.configure(def)
    for (const { name, unit } of this.configuration.metrics) {
      this.metrics[name] = unit
    }
  }

  async start(): Promise<void> {
    await this.sample() // dry run, to check files/url are accessible
  }

  protected async sample(): Promise<PollData<ProbeMetrics>> {
    if (! this.configuration) throw new Error('RegexProbe not initialized')

    const { source, metrics } = this.configuration

    let data: string
    if (source.protocol === 'file:') {
      const file = fileURLToPath(source)
      data = await readFile(file, 'utf-8')
    } else {
      const response = await fetch(source)
      if (response.status !== 200) {
        throw new Error(`Error fetching ${source} (status=${response.status})`)
      }
      data = await response.text()
    }

    this.log.trace('Read', source)
    this.log.trace(data)

    const values: PollData<ProbeMetrics> = {}

    for (const { name, expr } of metrics) {
      let value = data

      const items = typeof expr === 'string' ? [ expr ] : expr
      for (const item of items) {
        const { pattern, replace } = typeof item === 'string' ?
            { pattern: item, replace: '$0' } : item

        const regexp = new RegExp(pattern)
        const match = regexp.exec(value)

        value = (! match) ? '' : match.slice(0, 10)
            .reduce((r, v = '', g) => r.replaceAll(`$${g}`, v), replace)

        this.log.debug('Pattern', regexp, `(replacement="${replace}") =>`, JSON.stringify(value))
      }

      values[name] = +value
    }

    return values
  }
}
