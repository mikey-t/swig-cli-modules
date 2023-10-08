import fs from 'node:fs'

export interface DbContextConfig {
  name: string
  cliKey: string
  useWhenNoContextSpecified?: boolean
}

export class EntityFrameworkConfig {
  dbMigratorPath: string | undefined
  dbContexts: DbContextConfig[] = []

  init(dbMigrationPath: string, dbContexts: DbContextConfig[]) {
    this.dbMigratorPath = dbMigrationPath
    this.dbContexts = dbContexts
  }

  throwIfInvalid() {
    if (!this.dbMigratorPath) {
      throw new Error('SwigEntityFrameworkConfig.dbMigratorPath is required')
    }
    if (!fs.existsSync(this.dbMigratorPath)) {
      throw new Error('SwigEntityFrameworkConfig.dbMigratorPath error - path does not exist')
    }
    if (this.dbContexts.length === 0) {
      throw new Error('SwigEntityFrameworkConfig.dbContexts must have at least one entry')
    }
  }
}
