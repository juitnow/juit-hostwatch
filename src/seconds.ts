import { assertSchema, assertValidation, makeValidatorFactory, NumberValidator } from 'justus'

// Constants defining milliseconds for 1 second, 1 hour, ... 1 year
const s = 1000
const m = s * 60
const h = m * 60
const d = h * 24
const w = d * 7
const y = d * 365.25

// Our units (and shorthands) and associate them with their millisecond value
const units: Record<string, number> = {
  millisecond: 1, msec: 1, ms: 1,
  second: s, sec: s, s: s,
  minute: m, min: m, m: m,
  hour: h, hr: h, h: h,
  day: d, d: d,
  week: w, wk: w, w: w,
  year: y, yr: y, y: y,
}

// Prepare a giant union of all our units, with plurals, remembering that
// while "secs" equals "sec", "ms" does not indeed equal "m"
const union = Object.keys(units).reduce((union, unit) => {
  if ((unit != 'ms') && (unit.length > 1)) unit = `${unit}s?`
  return union ? `${union}|${unit}` : unit
}, '')

// Regular expressions to match each time component, and the overall value
const componentRegExp = new RegExp(`\\s*(\\d+)\\s*(${union})?\\s*`, 'g')
const valueRegExp = new RegExp(`^(${componentRegExp.source})+$`)

/** Constraints to validate a time component string with. */
export declare interface MillisecondsConstraints {
  /** The _inclusive_ maximum value in milliseconds: `value <= maximum` */
  maximum?: number;
  /** The _inclusive_ minimum value in milliseconds: `value >= minimum` */
  minimum?: number;
  /** The _exclusive_ maximum value in milliseconds: `value < exclusiveMaximum` */
  exclusiveMaximum?: number;
  /** The _exclusive_ minimum value in milliseconds: `value > exclusiveMaximum` */
  exclusiveMinimum?: number;
  /** The default unit to use when only a value was specified (default: `milliseconds`) */
  defaultUnit?: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'years',
}

/**
 * Simple validator parsing time components (like "1 min 5 secs") and returning
 * the time value _in milliseconds_.
 *
 * The default unit (when not specified as in the value "123") will be seconds.
 */
export class MillisecondsValidator extends NumberValidator {
  private readonly _defaultUnit: keyof typeof units
  private readonly _defaultDuration: number

  constructor(constraints: MillisecondsConstraints = {}) {
    const { defaultUnit = 'milliseconds', ...numberConstraints } = constraints
    super(numberConstraints)

    this._defaultUnit = defaultUnit.slice(0, -1)
    this._defaultDuration = units[this._defaultUnit]
    assertSchema(!! this._defaultDuration, `Invalid default unit "${defaultUnit}"`)
  }

  validate(value: unknown): number {
    // If value is a number, it's always the number of seconds
    if (typeof value === 'number') return super.validate(value * this._defaultDuration)

    // If value is not a number, then it *must* be a string
    assertValidation(typeof value === 'string', 'Value is not a string or number')

    // The overall value must be a valid time string (e.g. "1min 2 s")
    const valueMatch = valueRegExp.exec(`${value}`)
    assertValidation(valueMatch != null, 'Value is not a valid time string')

    // Parse time components, one at a time...
    let milliseconds = 0
    let match = componentRegExp.exec(valueMatch[0])
    while (match) {
      // Parse quanitity and unit (unit defaults to "seconds")
      const quantity = parseInt(match[1])
      const unit = match[2] || this._defaultUnit

      // Figure out the duration of a unit, considering that the string
      // "seconds" is equivalent to the string "second" ("ms" is not "m" !!!)
      let duration = units[unit]
      if ((! duration) && (unit !== 'ms') && (unit.endsWith('s'))) {
        duration = units[unit.slice(0, -1)]
      }

      // This should never happen if our regular expression is correct...
      assertValidation(!! duration, `Unknown duration for time unit "${unit}"`)

      // Calculate the time in milliseconds for our component, add it to the
      // total time and try to match the next component (if we have any)...
      milliseconds = milliseconds + (quantity * duration)
      match = componentRegExp.exec(value)
    }

    // Defer validation of constraints to the number validator
    return super.validate(milliseconds)
  }
}

/**
 * Validate time components (like "1 min 5 secs") and returning the time value
 * _in milliseconds_.
 *
 * The default unit (when not specified as in the value "123") will be seconds.
 */
export const millis = makeValidatorFactory(new MillisecondsValidator(),
    (constraints: MillisecondsConstraints) => new MillisecondsValidator(constraints))
