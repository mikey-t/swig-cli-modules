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
   * 
   * An example value for the MikeyT.DbMigrations.PostgresSetup type: `'PostgresSetup'`.
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
