import { EntityFrameworkConfig } from '../EntityFrameworkConfig.js'

/**
 * Example setup:
 * 
 * @example
 * 
 * ```
 * import efConfig from 'swig-cli-modules/config/EntityFramework'
 * 
 * efConfig.init(
 *   './server/src/DbMigrator',
 *   [
 *     { name: 'MainDbContext', cliKey: 'main', useWhenNoContextSpecified: true },
 *     { name: 'TestDbContext', cliKey: 'test' }
 *   ]
 * )
 * ```
 */
const config = new EntityFrameworkConfig()

export default config
