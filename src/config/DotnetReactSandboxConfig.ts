import ProjectSetupUtil from '../utils/ProjectSetupUtil.js'
import SandboxDependencyChecker from '../modules/DotnetReactSandbox/SandboxDependencyChecker.js'
import { getRequiredEnvVar } from '@mikeyt23/node-cli-utils'
import { DockerComposeConfig } from './DockerComposeConfig.js'
import { EntityFrameworkConfig } from './EntityFrameworkConfig.js'
import dockerConfig from './singleton/DockerComposeConfigSingleton.js'
import config from './singleton/EntityFrameworkConfigSingleton.js'
import { classToJson } from '@mikeyt23/node-cli-utils'

export class DotnetReactSandboxConfig {
  private _projectName = 'set_project_name_env_and_call_config_init'

  private _buildDir = './build'
  private _buildWwwrootDir = `${this._buildDir}/wwwroot`
  private _releaseDir = './release'
  private _serverPath = './server/src/WebServer'
  private _serverTestPath = `./server/src/WebServer.Test`
  private _clientPath = './client'
  private _dbMigratorPath = 'server/src/DbMigrator/'
  private _dbContainerName = 'postgresql'

  private _releaseTarballName: string = `set_project_name_env_and_call_config_init`
  private _dbMigratorTarballName = 'DbMigrator.tar.gz'
  private _dockerComposePath = './docker-compose.yml'
  private _serverCsprojPath = `${this._serverPath}/WebServer.csproj`
  private _preDeployHttpsPort = '3000'
  private _preDeployHttpPort = '3001'
  private _mainDbContextName = 'MainDbContext'
  private _testDbContextName = 'TestDbContext'
  private _directoriesWithEnv = [this._serverPath, this._clientPath, this._serverTestPath, this._dbMigratorPath, this._buildDir]

  private _dependencyChecker: SandboxDependencyChecker | undefined
  private _projectSetupUtil: ProjectSetupUtil | undefined

  loadEnvFunction: () => void = () => { throw new Error('You must set the required config value dotnetReactSandboxConfig.loadEnvFunction (for example, set it to "dotenv.config")') }

  private _noDb: boolean = false
  private _siteUrl: string | undefined = undefined

  private readonly _swigDockerConfig: DockerComposeConfig = dockerConfig
  private readonly _efConfig: EntityFrameworkConfig = config

  constructor() {
    this.populateCommonCliArgs()
    this._efConfig.init(this._dbMigratorPath, [
      { name: 'MainDbContext', cliKey: 'main', useWhenNoContextSpecified: true },
      { name: 'TestDbContext', cliKey: 'test' }
    ])
  }

  init(loadEnvFunction: () => void) {
    this.loadEnvFunction = loadEnvFunction
    loadEnvFunction()
    const projectNameFromEnv = process.env.PROJECT_NAME
    if (projectNameFromEnv) {
      this.projectName = projectNameFromEnv
    }
  }

  get projectName() {
    return this._projectName
  }

  set projectName(value: string) {
    this._projectName = value
    this._releaseTarballName = `${this._projectName}.tar.gz`
  }

  get buildDir() {
    return this._buildDir
  }

  get buildWwwrootDir() {
    return this._buildWwwrootDir
  }

  get releaseDir() {
    return this._releaseDir
  }

  get serverPath() {
    return this._serverPath
  }

  get serverTestPath() {
    return this._serverTestPath
  }

  get clientPath() {
    return this._clientPath
  }

  get dbMigratorPath() {
    return this._dbMigratorPath
  }

  get dbContainerName() {
    return this._dbContainerName
  }

  get releaseTarballName() {
    return this._releaseTarballName
  }

  get dbMigratorTarballName() {
    return this._dbMigratorTarballName
  }

  get dockerComposePath() {
    return this._dockerComposePath
  }

  set dockerComposePath(value: string) {
    this._dockerComposePath = value
    this._swigDockerConfig.dockerComposePath = value
  }

  get serverCsprojPath() {
    return this._serverCsprojPath
  }

  get preDeployHttpsPort() {
    return this._preDeployHttpsPort
  }

  get preDeployHttpPort() {
    return this._preDeployHttpPort
  }

  get mainDbContextName() {
    return this._mainDbContextName
  }

  get testDbContextName() {
    return this._testDbContextName
  }

  get directoriesWithEnv() {
    return this._directoriesWithEnv
  }

  set directoriesWithEnv(value: string[]) {
    this._directoriesWithEnv = value
  }

  get dependencyChecker(): SandboxDependencyChecker {
    if (this._dependencyChecker === undefined) {
      this._dependencyChecker = new SandboxDependencyChecker()
    }
    return this._dependencyChecker
  }

  get projectSetupUtil(): ProjectSetupUtil {
    if (this._projectSetupUtil === undefined) {
      this._projectSetupUtil = new ProjectSetupUtil()
    }
    return this._projectSetupUtil
  }

  get siteUrl(): string {
    if (!this._siteUrl) {
      this._siteUrl = getRequiredEnvVar('SITE_URL')
    }
    return this._siteUrl
  }

  get nodb(): boolean {
    return this._noDb
  }

  toJSON = () => classToJson(this)

  private populateCommonCliArgs() {
    if (process.argv[3] && process.argv[3].toLowerCase() === 'nodb') {
      this._noDb = true
    }
  }
}
