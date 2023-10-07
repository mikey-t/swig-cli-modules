import fs from 'node:fs'

export interface DbContextConfig {
  name: string
  cliKey: string
  useWhenNoContextSpecified?: boolean
}

class SwigEntityFrameworkConfig {
  dbMigratorPath: string | undefined
  dbContexts: DbContextConfig[] = []

  init(dbMigrationPath: string, dbContexts: DbContextConfig[]) {
    this.dbMigratorPath = dbMigrationPath
    this.dbContexts = dbContexts
  }

  throwIfInvalid() {
    if (!this.dbMigratorPath) {
      throw new Error('swigEntityFrameworkConfig.dbMigratorPath is required')
    }
    if (!fs.existsSync(this.dbMigratorPath)) {
      throw new Error('swigEntityFrameworkConfig.dbMigratorPath error - path does not exist')
    }
    if (this.dbContexts.length === 0) {
      throw new Error('swigEntityFrameworkConfig.dbContexts must have at least one entry')
    }
  }
}

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
const swigEntityFrameworkConfig = new SwigEntityFrameworkConfig()

export default swigEntityFrameworkConfig
