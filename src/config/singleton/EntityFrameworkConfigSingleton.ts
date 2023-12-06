import { EntityFrameworkConfig } from '../EntityFrameworkConfig.js'

/**
 * Example setup that also uses `DockerCompose` swig module:
 * 
 * @example
 * 
 * ```
 * import efConfig from 'swig-cli-modules/ConfigEntityFramework'
 * 
 * const dbMigrationsProjectPath = 'src/DbMigrations'
 * 
 * efConfig.init(
 *   dbMigrationsProjectPath,
 *   [
 *     {
 *       name: 'MainDbContext',
 *       cliKey: 'main',
 *       dbSetupType: 'PostgresSetup',
 *       useWhenNoContextSpecified: true
 *     }
 *   ]
 * )
 * 
 * export * from 'swig-cli-modules/EntityFramework'
 * export * from 'swig-cli-modules/DockerCompose'
 * 
 * ```
 */
const config = new EntityFrameworkConfig()

export default config
