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
      throw new Error('SwigEntityFrameworkConfig error - dbMigratorPath is required')
    }
    if (!fs.existsSync(this.dbMigratorPath)) {
      throw new Error(`SwigEntityFrameworkConfig error - dbMigratorPath path does not exist: ${this.dbMigratorPath}`)
    }
    if (this.dbContexts.length === 0) {
      throw new Error('SwigEntityFrameworkConfig error - dbContexts must have at least one entry')
    }
  }
}
