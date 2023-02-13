import { readFile } from 'node:fs/promises'

import { allowAdditionalProperties, arrayOf, object, objectOf, optional, string, validate } from 'justus'
import { parse as parseYaml } from 'yaml'

import { Replacer } from './replacer'
import { logger } from './logger'

const log = logger('config')

const configValidator = object({
  config: optional(object, {}),
  variables: optional(object, {}),
  dimensions: optional(objectOf(string), {}),
  probes: arrayOf({ probe: string, ...allowAdditionalProperties }),
  sinks: arrayOf({ sink: string, ...allowAdditionalProperties }),
})

interface ParsedConfig {
  config: Record<string, any>,
  dimensions: Record<string, string>,
  probes: { probe: string, [ key: string ]: any }[],
  sinks: { sink: string, [ key: string ]: any }[],
}

export async function parse(file: string): Promise<ParsedConfig> {
  const text = await readFile(file, 'utf-8')
  const data = parseYaml(text)

  const { variables, ...options } = validate(configValidator, data)

  const replacer = new Replacer()
  const vars = await replacer.replace(variables, true)

  const [ config, dimensions, probes, sinks ] = await Promise.all([
    replacer.replace(options.config),
    replacer.replace(options.dimensions),
    replacer.replace(options.probes),
    replacer.replace(options.sinks),
  ])

  log.debug('Known variables:')
  Object.entries(vars).forEach(([ name, value ]) => log.debug('- %s =>', name, value))

  log.info('Global dimensions:')
  Object.entries(dimensions).forEach(([ name, value ]) => log.info('- %s =>', name, value))

  log.info('Probes configured:', probes.length)
  log.info('Sinks configured:', sinks.length)

  return { config, dimensions, probes, sinks }
}
