import { DotnetReactSandboxConfig } from '../DotnetReactSandboxConfig.js'

/**
 * Most of these config values are not meant to be changed. The `projectName` is the main property that will always be different in each project,
 * but that should get pulled in from an env var `PROJECT_NAME`. Under normal circumstances your swigfile will look like this:
 * 
 * @example
 * 
 * ```
 * import dotenv from 'dotenv'
 * import { dotnetReactSandboxConfig } from 'swig-cli-modules/config'
 * 
 * dotnetReactSandboxConfig.init(dotenv.config)
 * 
 * export * from 'swig-cli-modules/DotnetReactSandbox'
 * ```
 */
const config = new DotnetReactSandboxConfig()

export default config
