import { get as http } from 'node:http'
import { get as https } from 'node:https'

import type { RequestOptions } from 'node:https'

export function simpleFetch(url: string, options: RequestOptions = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []

    const get = url.startsWith('https:') ? https : http

    const req = get(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Error fetching "${url}" (status=${res.statusCode}`))
        req.destroy()
        return
      }

      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('error', (err) => reject(err))
    })

    req.on('error', (err) => reject(err))
    req.end()
  })
}
