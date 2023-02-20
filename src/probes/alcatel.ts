import { AlcatelClient } from '@juit/lib-tcl-router'
import { object, optional, string } from 'justus'

import { Unit } from '../types'
import { AbstractProbe } from './abstract'

import type { AlcatelClientBasicStatus } from '@juit/lib-tcl-router'
import type { PollData } from './abstract'

const ONE_GIGABYTE = 1073741824

const metrics = {
  TotalNetworkIn: Unit.Bytes,
  TotalNetworkOut: Unit.Bytes,
  BandwidthNetworkIn: Unit.Bytes_Second,
  BandwidthNetworkOut: Unit.Bytes_Second,
  ConnectionStatus: Unit.None, // -1 disconnecting, 0 disconnected, 1 connecting, 2 connected
  NetworkType: Unit.None, // number of "G"s: 0 no service, 2 2G, ... 4.5 4G+, 5 5G
  // Varous signal strength data
  SignalStrength: Unit.None,
  SignalRSSI: Unit.None,
  SignalRSRP: Unit.None,
  SignalSINR: Unit.None,
  SignalRSRQ: Unit.None,
} as const

const validator = object({
  hostname: string({ minLength: 1 }),
  username: optional(string({ minLength: 1 })),
  password: optional(string({ minLength: 1 })),
})

interface Status {
  timestamp: number,
  bytesOut: number,
  bytesIn: number,
}

export class AlcatelRouterProbe extends AbstractProbe<typeof metrics, typeof validator> {
  private _client?: AlcatelClient
  private _status?: Status
  private _extended?: boolean

  constructor() {
    super('load', metrics, validator)
  }

  async start(): Promise<void> {
    const { hostname, username: userName, password } = this.configuration
    this._client = new AlcatelClient(hostname, password, { userName })
    this._extended = !! password
    try {
      const status = this._extended ?
        await this._client.pollExtended() :
        await this._client.pollBasic()
      this.log.debug(`Successfully connected to "${status.device}" at ${hostname}`)
    } catch (cause) {
      throw new Error(`Error contacting router at "${hostname}"`, { cause })
    }
  }

  protected async sample(): Promise<PollData<typeof metrics>> {
    if (! this._client) throw new Error('TclRouter probe not initialized')

    if (! this._extended) {
      const status = await this._client.pollBasic()
      return {
        ConnectionStatus: getConnectionStatus(status.connection_status),
        NetworkType: getNetworkType(status.network_type),
        SignalStrength: status.strength,
      }
    }

    const {
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      ...data } = await this._client.pollExtended()
    const timestamp = Date.now()

    let bandwidthIn: number = NaN
    let bandwidthOut: number = NaN

    if (this._status && (this._status.timestamp < timestamp)) {
      const seconds = (timestamp - this._status.timestamp) / 1000
      bandwidthOut = (bytesOut - this._status.bytesOut) / seconds
      bandwidthIn = (bytesIn - this._status.bytesIn) / seconds

      // interface traffic data jumps (large swings of > 10s gigabytes)... if
      // we see some unreasonable number, let's simply give up and push a NaN!
      if ((bandwidthIn > ONE_GIGABYTE) || (bandwidthIn < 0)) bandwidthIn = NaN
      if ((bandwidthOut > ONE_GIGABYTE) || (bandwidthOut < 0)) bandwidthOut = NaN
    }

    this._status = { timestamp, bytesIn, bytesOut }

    return {
      TotalNetworkIn: bytesIn,
      TotalNetworkOut: bytesOut,
      BandwidthNetworkIn: bandwidthIn,
      BandwidthNetworkOut: bandwidthOut,
      ConnectionStatus: getConnectionStatus(data.connection_status),
      NetworkType: getNetworkType(data.network_type),
      SignalStrength: data.strength,
      SignalRSSI: data.rssi,
      SignalRSRP: data.rsrp,
      SignalSINR: data.sinr,
      SignalRSRQ: data.rsrq,
    }
  }
}

/** Number of "G"s: 0 no service, 2 2G, ... 4.5 4G+, 5 5G */
function getNetworkType(type: AlcatelClientBasicStatus['network_type']): number {
  switch (type) {
    case 'No Service': return 0
    case '2G': return 2
    case '3G': return 3
    case '3G+': return 3.5
    case '4G': return 4
    case '4G+': return 4.5
    case '5G': return 5
    case 'Unknown':
    default: return NaN
  }
}

/** Connection status: -1 disconnecting, 0 disconnected, 1 connecting, 2 connected */
function getConnectionStatus(status: AlcatelClientBasicStatus['connection_status']): number {
  switch (status) {
    case 'Disconnecting': return -1
    case 'Disconnected': return 0
    case 'Connecting': return 1
    case 'Connected': return 2
    case 'Unknown':
    default: return NaN
  }
}
