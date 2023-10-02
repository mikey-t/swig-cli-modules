import fs from 'node:fs'

export interface DbContextConfig {
  name: string
  cliKey: string
  useWhenNoContextSpecified?: boolean
}

class SwigEntityFrameworkConfig {
  dbMigratorPath: string | undefined
  dbContexts: DbContextConfig[] = []

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

export const swigEntityFrameworkConfig = new SwigEntityFrameworkConfig()
