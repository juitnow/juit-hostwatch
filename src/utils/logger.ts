/* eslint-disable no-console */
import { isatty } from 'node:tty'
import { formatWithOptions } from 'node:util'

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

const Level = {
  'TRACE': 1,
  'DEBUG': 2,
  'INFO': 3,
  'WARN': 4,
  'ERROR': 5,
  'FATAL': 6,
  'OFF': 100,
} as const

type Level = (typeof Level)[keyof typeof Level]

/* ========================================================================== */

export type LogLevel = keyof typeof Level

export const logLevels = Object.keys(Level) as LogLevel[]

export interface LogFactory {
  (tag: string): Logger
  logLevel: LogLevel
  logTimes: boolean
  logColors: boolean
}

export interface Logger {
  trace(msg: string, ...args: any[]): void,
  debug(msg: string, ...args: any[]): void,
  info(msg: string, ...args: any[]): void,
  warn(msg: string, ...args: any[]): void,
  error(msg: string, ...args: any[]): void,
  fatal(msg: string, ...args: any[]): void,
}

/* ========================================================================== *
 * DEFAULT OPTIONS                                                            *
 * ========================================================================== */

let logLevel: Level = Level.INFO
let logTimes = isatty(1) // no TTY? we assume we're being run by systemd
let logColors = isatty(1) // colorize (by default) only on TTYs

/* ========================================================================== *
 * ACTUAL LOGGING IMPLEMENTATION                                              *
 * ========================================================================== */

const GRY = '\u001b[90m'
const BLU = '\u001b[34m'
const CYN = '\u001b[36m'
const GRN = '\u001b[32m'
const YLW = '\u001b[33m'
const RED = '\u001b[31m'
const MGT = '\u001b[35m'
const RST = '\u001b[0m'

/* Our log labels (colorised and not) */
const labelsPlain = [
  '[-----]',
  '[TRACE]',
  '[DEBUG]',
  '[INFO ]',
  '[WARN ]',
  '[ERROR]',
  '[FATAL]',
]

const labelsColor = [
  `${GRY}[-----]${GRY}`, // placeholder
  `${BLU}[TRACE]${RST}`, // trace, blue
  `${CYN}[DEBUG]${RST}`, // debug, cyan
  `${GRN}[INFO ]${RST}`, // info, green
  `${YLW}[WARN ]${RST}`, // warn, yellow
  `${RED}[ERROR]${RST}`, // error, red
  `${MGT}[FATAL]${RST}`, // fatal, magenta
]

/* Format timestamp in local timezone, nicely */
function timestamp(): string {
  const date = new Date()
  return date.getFullYear().toString().padStart(4, '0') +
      '/' + (date.getMonth() + 1).toString().padStart(2, '0') +
      '/' + date.getDate().toString().padStart(2, '0') +
      ' ' + date.getHours().toString().padStart(2, '0') +
      ':' + date.getMinutes().toString().padStart(2, '0') +
      ':' + date.getSeconds().toString().padStart(2, '0') +
      '.' + date.getMilliseconds().toString().padStart(3, '0')
}

function emit(level: Level, tag: string, msg: string, ...args: any): void {
  if (level < logLevel) return

  const prefix: string[] = []
  if (logColors) {
    if (logTimes) prefix.push(`${GRY}${timestamp()}${RST}`)
    prefix.push(labelsColor[level])
    prefix.push(`${GRY}[${tag}]${RST}`)
  } else {
    if (logTimes) prefix.push(timestamp())
    prefix.push(labelsPlain[level])
    prefix.push(`[${tag}]`)
  }

  prefix.push('')
  const pfx = prefix.join(' ')

  const string = formatWithOptions({ colors: logColors }, msg, ...args)
  const final = string.replaceAll(/^/gm, pfx)

  if (level >= Level.ERROR) return console.error(final)
  if (level >= Level.WARN) return console.warn(final)
  if (level >= Level.INFO) return console.info(final)
  console.debug(final)
}

/* ========================================================================== *
 * EXPORTED LOG FACTORY                                                       *
 * ========================================================================== */

export const logger = ((tag: string): Logger => ({
  trace: (msg: string, ...args: any[]): void => emit(Level.TRACE, tag, msg, ...args),
  debug: (msg: string, ...args: any[]): void => emit(Level.DEBUG, tag, msg, ...args),
  info: (msg: string, ...args: any[]): void => emit(Level.INFO, tag, msg, ...args),
  warn: (msg: string, ...args: any[]): void => emit(Level.WARN, tag, msg, ...args),
  error: (msg: string, ...args: any[]): void => emit(Level.ERROR, tag, msg, ...args),
  fatal: (msg: string, ...args: any[]): void => emit(Level.FATAL, tag, msg, ...args),
})) as LogFactory

Object.defineProperties(logger, {
  logTimes: { get: () => logTimes, set: (t: boolean) => void (logTimes = !!t) },
  logColors: { get: () => logColors, set: (c: boolean) => void (logColors = !!c) },
  logLevel: {
    set: (l: LogLevel) => void (logLevel = Level[l] || Level.INFO),
    get: () => logLevel <= Level.TRACE ? 'TRACE' :
               logLevel <= Level.DEBUG ? 'DEBUG' :
               logLevel <= Level.INFO ? 'INFO' :
               logLevel <= Level.WARN ? 'WARN' :
               logLevel <= Level.ERROR ? 'ERROR' :
               logLevel <= Level.FATAL ? 'FATAL' :
               'OFF',
  },
})
