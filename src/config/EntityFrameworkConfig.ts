import { DotnetRuntimeIdentifier } from '@mikeyt23/node-cli-utils/dotnetUtils'
import { basename } from 'node:path'
import { DbContextConfig } from '../modules/EntityFramework/DbContextConfig.js'
import { FuncOrAsyncFunc } from '@mikeyt23/node-cli-utils'

// Dev notes:
// - Keep the init method light and avoid doing anything here that could prevent a swigfile from loading.
// - See EntityFramework.ts and EntityFrameworkInternal.ts for examples of config validation and use.

const supportedDotnetSdkVersionsImmutable = [6, 7, 8] as const
export const supportedDotnetSdkVersions: number[] = [...supportedDotnetSdkVersionsImmutable]
export type SupportedDotnetSdkVersion = typeof supportedDotnetSdkVersionsImmutable[number]

export interface EntityFrameworkConfigOptions {
  /** Defaults to dotnet core `8` (`net8.0`) if not specified. Supports `6`, `7` and `8` currently. */
  dotnetSdkVersion: SupportedDotnetSdkVersion
  /** Defaults to ['linux-x64', 'win-x64'] if not specified. */
  releaseRuntimeIds: DotnetRuntimeIdentifier[]
  /**
   * Optional. Any function references passed in will be executed once before each time any of the exported EF module swig tasks are executed.
   * However, note that they will not be run for any of the optional functions exported from the `EntityFrameworkUtils` module except `executeEfAction`.
   */
  beforeHooks: FuncOrAsyncFunc<unknown>[]
}

/**
 * Library consumer instructions for swigfile:
 * - Import the singleton config object from `swig-cli-modules/ConfigEntityFramework`
 * - Call the config singleton object's `init` method
 * - Re-export all from `swig-cli-modules/EntityFramework`
 */
export class EntityFrameworkConfig {
  private _initCalled = false
  private _dbMigrationsProjectPath: string | undefined
  private _dbMigrationsProjectName: string = ''
  private _dbContexts: DbContextConfig[] = []
  private _dotnetSdkVersion: SupportedDotnetSdkVersion = 8
  private _releaseRuntimeIds: DotnetRuntimeIdentifier[] = ['linux-x64', 'win-x64']
  private _beforeHooks: FuncOrAsyncFunc<unknown>[] = []

  get dbMigrationsProjectPath(): string | undefined {
    return this._dbMigrationsProjectPath
  }

  get dbMigrationsProjectName(): string {
    return this._dbMigrationsProjectName
  }

  get dbContexts(): DbContextConfig[] {
    return this._dbContexts
  }

  get initCalled(): boolean {
    return this._initCalled
  }

  get dotnetSdkVersion(): SupportedDotnetSdkVersion {
    return this._dotnetSdkVersion
  }

  get releaseRuntimeIds(): DotnetRuntimeIdentifier[] {
    return this._releaseRuntimeIds
  }

  get beforeHooks(): FuncOrAsyncFunc<unknown>[] {
    return [...this._beforeHooks]
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
    if (options?.releaseRuntimeIds) {
      this._releaseRuntimeIds = options.releaseRuntimeIds
    }
    if (options?.beforeHooks) {
      this._beforeHooks = options.beforeHooks
    }
  }
}
