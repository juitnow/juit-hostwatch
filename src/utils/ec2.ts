import { simpleFetch } from './fetch'

/** EC2 data is fetched only once, for all Replacers */
const _metaDataEc2: Record<string, string> = {}

export async function getMetaData(key: string): Promise<string> {
  if (key in _metaDataEc2) return _metaDataEc2[key]
  try {
    const url = `http://169.254.169.254/latest/meta-data/${key}`
    return _metaDataEc2[key] = await simpleFetch(url)
  } catch (error: any) {
    throw new Error(`Error getting EC2 metadata for "${key}"`, { cause: error })
  }
}
