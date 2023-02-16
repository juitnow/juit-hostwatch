import { readFile } from 'node:fs/promises'

import { arrayOf, boolean, object, objectOf, oneOf, optional, string, validate } from 'justus'
import { parse as parseYaml } from 'yaml'

import { logger, logLevels } from './utils/logger'
import { millis } from './utils/milliseconds'
import { Replacer } from './utils/replacer'

import type { HostWatchDefinition } from './types'

const log = logger('config')

const configValidator = object({
  logLevel: optional(oneOf(...logLevels)),
  logTimes: optional(boolean({ fromString: true })),
  logColors: optional(boolean({ fromString: true })),
  pollInterval: optional(millis({ minimum: 1_000, maximum: 120_000, defaultUnit: 'seconds' }), '30 sec'),
})

const probeValidator = object({
  probe: string({ minLength: 1 }),
  name: optional(string({ minLength: 1 })),
  publish: optional(arrayOf(string), []),
  dimensions: optional(objectOf(string), {}),
  config: optional(object),
})

const sinkValidator = object({
  sink: string({ minLength: 1 }),
  name: optional(string({ minLength: 1 })),
  config: optional(object),
})

const validator = object({
  config: optional(configValidator, {}),
  variables: optional(object, {}),
  dimensions: optional(objectOf(string), {}),
  probes: arrayOf(probeValidator),
  sinks: arrayOf(sinkValidator),
})

export async function parse(file: string): Promise<HostWatchDefinition> {
  const text = await readFile(file, 'utf-8')
  const data = parseYaml(text, {
    reviver: (_key, val) => val == null ? undefined : val,
  })

  const { variables, ...options } = validate(validator, data)

  const replacer = new Replacer()
  const vars = await replacer.replace(variables, true)

  const [ config, dimensions, probes, sinks ] = await Promise.all([
    replacer.replace(options.config || validate(configValidator, {})),
    replacer.replace(options.dimensions),
    replacer.replace(options.probes),
    replacer.replace(options.sinks),
  ])

  log.debug('Known variables:')
  const vlen = Object.keys(vars).reduce((l, s) => s.length > l ? s.length : l, 0)
  Object.entries(vars).forEach(([ name, value ], i, a) => {
    const [ line, dash ] = (i + 1) == a.length ? [ ' \u2514\u2500', '\u2500' ] : [ ' \u2502 ', ' ' ]
    log.debug(line + `   ${name}`.padStart(vlen + 3, dash), '=>', value)
  })

  log.info('Global dimensions:')
  const dlen = Object.keys(dimensions).reduce((l, s) => s.length > l ? s.length : l, 0)
  Object.entries(dimensions).forEach(([ name, value ], i, a) => {
    const [ line, dash ] = (i + 1) == a.length ? [ ' \u2514\u2500', '\u2500' ] : [ ' \u2502 ', ' ' ]
    log.info(line + `   ${name}`.padStart(dlen + 3, dash), '=>', value)
  })

  log.info('Probes configured:', probes.length)
  log.info('Sinks configured:', sinks.length)

  return { config, dimensions, probes, sinks }
}
