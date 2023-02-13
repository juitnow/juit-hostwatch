/* eslint-disable no-console */
import { isatty } from 'node:tty'
import { formatWithOptions } from 'node:util'

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

export interface Logger {
  trace(msg: string, ...args: any[]): void,
  debug(msg: string, ...args: any[]): void,
  info(msg: string, ...args: any[]): void,
  warn(msg: string, ...args: any[]): void,
  error(msg: string, ...args: any[]): void,
  fatal(msg: string, ...args: any[]): void,
}

enum LogLevel {
  'TRACE' = 0,
  'DEBUG' = 1,
  'INFO' = 2,
  'WARN' = 3,
  'ERROR' = 4,
  'FATAL' = 5,
  'OFF' = Number.MAX_SAFE_INTEGER
}

type Level = keyof typeof LogLevel

interface LogFactory {
  (tag: string): Logger
  logLevel: Level
  logTimes: boolean
  logColors: boolean
}

/* ========================================================================== *
 * DEFAULT OPTIONS                                                            *
 * ========================================================================== */

function getBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (! value) return defaultValue
  switch (value = value.trim().toLowerCase()) {
    case 'true': return true
    case 'false': return false
    default: return defaultValue
  }
}

let logLevel = LogLevel[process.env.LOG_LEVEL as Level] || LogLevel.INFO
let logTimes = getBoolean(process.env.LOG_TIMES, true)
let logColors = getBoolean(process.env.LOG_COLORS, isatty(1))

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
  '[TRACE]',
  '[DEBUG]',
  '[INFO ]',
  '[WARN ]',
  '[ERROR]',
  '[FATAL]',
]

const labelsColor = [
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

function emit(level: LogLevel, tag: string, msg: string, ...args: any): void {
  if (level < logLevel) {
    console.log('NOT LOGGING', level, logLevel)
    return
  }

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

  if (level >= LogLevel.ERROR) return console.error(final)
  if (level >= LogLevel.WARN) return console.warn(final)
  if (level >= LogLevel.INFO) return console.info(final)
  console.debug(final)
}

/* ========================================================================== *
 * EXPORTED LOG FACTORY                                                       *
 * ========================================================================== */

export const logger = ((tag: string): Logger => ({
  trace: (msg: string, ...args: any[]): void => emit(LogLevel.TRACE, tag, msg, ...args),
  debug: (msg: string, ...args: any[]): void => emit(LogLevel.DEBUG, tag, msg, ...args),
  info: (msg: string, ...args: any[]): void => emit(LogLevel.INFO, tag, msg, ...args),
  warn: (msg: string, ...args: any[]): void => emit(LogLevel.WARN, tag, msg, ...args),
  error: (msg: string, ...args: any[]): void => emit(LogLevel.ERROR, tag, msg, ...args),
  fatal: (msg: string, ...args: any[]): void => emit(LogLevel.FATAL, tag, msg, ...args),
})) as LogFactory

Object.defineProperties(logger, {
  logTimes: { get: () => logTimes, set: (t: boolean) => void (logTimes = !!t) },
  logColors: { get: () => logColors, set: (c: boolean) => void (logColors = !!c) },
  logLevel: {
    get: () => LogLevel[logLevel] as Level || 'INFO',
    set: (l: Level) => void (logLevel = LogLevel[l]),
  },
})
