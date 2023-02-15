import { chmod } from 'node:fs/promises'

import { tasks } from '@plugjs/build'
// eslint-disable-next-line import/no-extraneous-dependencies
import { build, exec, find, resolve, rmrf } from '@plugjs/plug'


const bundleDir = 'bundle'
const bundleScriptDir = `${bundleDir}/usr/share/hostwatch`

export default build({
  ...tasks(),

  async bundle(): Promise<void> {
    await this.transpile()

    // remove existing bundle directory
    await rmrf(bundleDir)

    // read up our version from "package.json"
    const version = (await import(resolve('package.json'), {
      assert: { type: 'json' },
    })).default.version

    // copy all files from "os/DEBIAN" and replace "@@VERSION@@""
    await find('**/DEBIAN/*', { directory: 'os' })
        .copy(bundleDir, { mode: 0o644, dirMode: 0o755 })
        .edit((content) => content.replaceAll('@@VERSION@@', version))

    // copy all files from "os" (excluding "os/DEBIAN") unchanged
    await find('**/*', { directory: 'os', ignore: '**/DEBIAN/*' })
        .copy(bundleDir, { mode: 0o644, dirMode: 0o755 })

    // copy native libraries from "@juit/lib-statvfs"
    await find('**/*.node', {
      directory: 'node_modules/@juit/lib-statvfs/native',
    }).copy(bundleScriptDir, { mode: 0o755, dirMode: 0o755 })

    // copy native libraries from "@juit/lib-statvfs"
    await find('**/*.node', {
      directory: 'node_modules/@juit/lib-ping/native',
    }).copy(bundleScriptDir, { mode: 0o755, dirMode: 0o755 })

    // bundle and minify our code
    await find('dist/main.mjs')
        .esbuild({
          bundle: true,
          format: 'cjs',
          outfile: `${bundleScriptDir}/hostwatch.js`,
          platform: 'node',
          sourcemap: false,
          minify: true,
        })

    // fixup permissions in distribution
    await chmod(resolve(`${bundleDir}/DEBIAN/postinst`), 0o755)
    await chmod(resolve(`${bundleDir}/etc/default/hostwatch`), 0o600)
    await chmod(resolve(`${bundleDir}/usr/bin/hostwatch`), 0o755)

    // create our ".deb" package
    await exec(
        'dpkg-deb',
        '--build',
        '--root-owner-group',
        resolve(bundleDir),
        resolve(`juit-hostwatch_${version}_all.deb`),
    )
  },
})
