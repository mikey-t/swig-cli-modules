import { basename } from 'node:path'

// Dev notes:
// - Keep the init method light and avoid doing anything here that could prevent a swigfile from loading.
// - See EntityFramework.ts and EntityFrameworkInternal.ts for examples of config validation and use.

/**
 * Metadata about `DbContext` classes in your DbMigrations project.
 */
export interface DbContextConfig {
  /**
   * The full name of the associated C# `DbContext` class in your DbMigrations project, for example "MainDbContext".
   * */
  name: string
  /**
   * The shortcut string that will accepted for this DbContext for CLI commands. For example, you might set this to "main" for
   * a DbContext called "MainDbContext".
   * */
  cliKey: string
  /**
   * For certain commands (`dbMigrate`, `dbAddMigration`, `dbRemoveMigration`, `dbListMigrations`), this `DbContext` will
   * be operated on if no context is specified. Multiple contexts can have this set to `true` to allow operating on multiple
   * contexts with one CLI command.
   */
  useWhenNoContextSpecified?: boolean
  /**
   * The full C# class name that inherits from `MikeyT.DbMigrations.DbSetup` and is used for the `dbSetup` and `dbTeardown`
   * commands. This class can be located within your DbMigrations project or the `MikeyT.DbMigrations` Nuget package, or any
   * project that is referenced by your DbMigrations project.
   */
  dbSetupType?: string
  /**
   * Optionally use a different subdirectory under the "Scripts" directory within your DbMigrations project for sql scripts
   * associated with this DbContext. If a value is provided it must be a single level below the Scripts directory, for example
   * "SomeDir" is valid but "SomeDir/AnotherDir" is not valid.
   * 
   * If not specified, script files will be generated directly in the DbMigrations project "Scripts" directory.
   * 
   * **Note**: you can also point this to the same subdirectory as another `DbContext` for the purpose of sharing all the
   * same migrations. Or similarly, you can simply omit this setting for both contexts to have them share scripts in the main
   * "Scripts" directory. This is particularly useful if you have a "main" and "test" database that you want to keep in sync.
   */
  scriptsSubdirectory?: string
}

/**
 * Consumers of the library should use the singleton config object by importing from `swig-cli-modules/ConfigEntityFramework`.
 */
export class EntityFrameworkConfig {
  private _initCalled = false
  private _dbMigrationsProjectPath: string | undefined
  private _dbMigrationsProjectName: string = ''
  private _dbContexts: DbContextConfig[] = []

  get dbMigrationsProjectPath(): string | undefined {
    return this._dbMigrationsProjectPath
  }

  get dbMigrationsProjectName(): string {
    return this._dbMigrationsProjectName
  }

  get dbContexts() {
    return this._dbContexts
  }

  get initCalled() {
    return this._initCalled
  }

  /**
   * Import the config singleton from `swig-cli-modules/ConfigEntityFramework` and call this method to enable importing of
   * swig tasks related to DB migrations with EntityFramework.
   * @param dbMigrationsProjectPath The path to your C# console app that utilizes the `MikeyT.DbMigrations` Nuget package (or the path where you want the project to get bootstrapped).
   * @param dbContexts An array of {@link DbContextConfig} containing the necessary metadata to execute EntityFramework commands and other CLI commands provided by the MikeyT.DbMigrations package.
   */
  init(dbMigrationsProjectPath: string, dbContexts: DbContextConfig[]) {
    if (this._initCalled) {
      throw new Error('Init should not be called more than once')
    }
    this._initCalled = true
    this._dbMigrationsProjectPath = dbMigrationsProjectPath
    this._dbMigrationsProjectName = basename(this._dbMigrationsProjectPath)
    this._dbContexts = dbContexts
  }
}
