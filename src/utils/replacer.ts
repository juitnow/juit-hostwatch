import { hostname } from 'node:os'

/** EC2 data is fetched only once, for all Replacers */
const _metaDataEc2: Record<string, string> = {}

export class Replacer {
  private readonly _env: Readonly<Record<string, string>>
  private readonly _var: Record<string, any> = {}

  constructor() {
    this._env = Object.entries(process.env).reduce((env, [ key, value ]) => {
      if (key && value) env[key.toLowerCase()] = value
      return env
    }, {} as Record<string, string>)
    this.setVariable('hostname', hostname())
  }

  setVariable(name: string, value: any): void {
    if (! name.match(/^[\w-]+$/)) {
      throw new TypeError(`Invalid variable name "${name}"`)
    }
    this._var[name.toLowerCase()] = value
  }

  async getReplacement(expr: string): Promise<string | number | boolean> {
    expr = expr.trim() // trim immediately, we don't care about white space

    const _match = expr.match(/^(\w+)[\t ]*:[\t ]*(.+)$/)

    if (! _match) {
      const name = expr.toLowerCase()
      if (name in this._var) return this.replace(this._var[name])
      throw new TypeError(`Unknown local variable "${name}"`)
    }

    const type = _match[1].trim()
    const data = _match[2].trim()

    switch (type) {
      case 'bool':
      case 'boolean': {
        const replacement = await this.getReplacement(data)
        const value = `${replacement}`.toLowerCase().trim()
        if (value === 'false') return false
        if (value === 'true') return true
        throw new TypeError(`Invalid boolean in expression "${expr}" (value=${replacement})`)
      }

      case 'num':
      case 'number': {
        const replacement = await this.getReplacement(data)
        const value = (+replacement)
        if (! isNaN(value)) return value
        throw new TypeError(`Invalid number in expression "${expr}" (value=${replacement})`)
      }

      case 'env': {
        const name = data.toLowerCase()
        if (name in this._env) return this._env[name]
        throw new TypeError(`Unknown environment variable "${name}"`)
      }

      // coverage ignore next
      // see https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-categories.html
      case 'ec2':
        if (expr in _metaDataEc2) return _metaDataEc2[expr]
        try {
          const from = `http://169.254.169.254/latest/meta-data/${expr}`
          const response = await fetch(from)
          if (response.status !== 200) {
            throw new Error(`Error fetching ${from} (status=${response.status})`)
          }
          return _metaDataEc2[expr] = await response.text()
        } catch (error: any) {
          throw new Error(`Error getting EC2 metadata for "${expr}"`, { cause: error })
        }

      default: {
        throw new TypeError(`Unsupported type "${type}" in expression "${expr}"`)
      }
    }
  }

  async replace<T = any>(value: T, setVariables?: boolean): Promise<T>
  async replace(value: any, setVariables = false): Promise<any> {
    if (typeof value === 'string') {
      for (let match = value.match(/^\${([^}]+)}$/); match != null; match = null) {
        return await this.getReplacement(match[1])
      }

      const expr = /\${([^}]+)}/g
      let last = 0
      let result = ''
      let match = expr.exec(value)
      while (match != null) {
        const replacement = await this.getReplacement(match[1])
        result += value.substring(last, match.index)
        result += typeof replacement === 'string' ? replacement : JSON.stringify(replacement)
        last = match.index + match[0].length
        match = expr.exec(value)
      }
      result += value.substring(last)

      return result
    } else if (value && (typeof value === 'object')) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i ++) {
          value[i] = await this.replace(value[i])
        }
      } else {
        for (const k in value) {
          value[k] = await this.replace(value[k])
          if (setVariables) this._var[k] = value[k]
        }
      }
    }

    return value
  }
}
