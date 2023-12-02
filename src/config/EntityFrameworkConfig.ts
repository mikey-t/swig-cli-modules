import { basename } from 'node:path'
import { DbContextConfig } from '../modules/EntityFramework/DbContextConfig.js'

// Dev notes:
// - Keep the init method light and avoid doing anything here that could prevent a swigfile from loading.
// - See EntityFramework.ts and EntityFrameworkInternal.ts for examples of config validation and use.

const supportedDotnetSdkVersionsImmutable = [6, 7, 8] as const
export const supportedDotnetSdkVersions: number[] = [...supportedDotnetSdkVersionsImmutable]
export type SupportedDotnetSdkVersion = typeof supportedDotnetSdkVersionsImmutable[number]

export interface EntityFrameworkConfigOptions {
  /** Defaults to dotnet core `8` (`net8.0`). */
  dotnetSdkVersion: SupportedDotnetSdkVersion
}

/**
 * Consumers of the library should use the singleton config object by importing from `swig-cli-modules/ConfigEntityFramework`
 * and then call it's `init` method.
 */
export class EntityFrameworkConfig {
  private _initCalled = false
  private _dbMigrationsProjectPath: string | undefined
  private _dbMigrationsProjectName: string = ''
  private _dbContexts: DbContextConfig[] = []
  private _dotnetSdkVersion: SupportedDotnetSdkVersion = 8

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

  get dotnetSdkVersion() {
    return this._dotnetSdkVersion
  }

  /**
   * Import the config singleton from `swig-cli-modules/ConfigEntityFramework` and call this method to enable importing of
   * swig tasks related to DB migrations with EntityFramework.
   * @param dbMigrationsProjectPath The path to your C# console app that utilizes the `MikeyT.DbMigrations` Nuget package (or the path where you want the project to get bootstrapped).
   * @param dbContexts An array of {@link DbContextConfig} containing the necessary metadata to execute EntityFramework commands and other CLI commands provided by the MikeyT.DbMigrations package.
   */
  init(dbMigrationsProjectPath: string, dbContexts: DbContextConfig[], options?: Partial<EntityFrameworkConfigOptions>) {
    if (this._initCalled) {
      throw new Error('Init should not be called more than once')
    }
    this._initCalled = true
    this._dbMigrationsProjectPath = dbMigrationsProjectPath
    this._dbMigrationsProjectName = basename(this._dbMigrationsProjectPath)
    this._dbContexts = dbContexts
    if (options?.dotnetSdkVersion) {
      this._dotnetSdkVersion = options.dotnetSdkVersion
    }
  }
}
