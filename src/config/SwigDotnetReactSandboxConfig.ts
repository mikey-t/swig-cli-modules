import ProjectSetupUtil from '../utils/ProjectSetupUtil.js'
import SandboxDependencyChecker from '../modules/DotnetReactSandbox/SandboxDependencyChecker.js'
import { getRequiredEnvVar } from '@mikeyt23/node-cli-utils'

class SwigDotnetReactSandboxConfig {
  projectName = 'set_project_name_env_and_call_config_init'

  buildDir = './build'
  buildWwwrootDir = `${this.buildDir}/wwwroot`
  releaseDir = './release'
  dockerPath = './docker'
  serverPath = './server/src/WebServer'
  serverTestPath = `./server/src/WebServer.Test`
  clientPath = './client'
  dbMigratorPath = 'server/src/DbMigrator/'
  dbContainerName = 'postgresql'

  releaseTarballName: string = `set_project_name_env_and_call_config_init`
  dbMigratorTarballName = 'DbMigrator.tar.gz'
  dockerComposePath = `${this.dockerPath}/docker-compose.yml`
  serverCsprojPath = `${this.serverPath}/WebServer.csproj`
  preDeployHttpsPort = '3000'
  preDeployHttpPort = '3001'
  mainDbContextName = 'MainDbContext'
  testDbContextName = 'TestDbContext'
  directoriesWithEnv = [this.dockerPath, this.serverPath, this.serverTestPath, this.dbMigratorPath, this.clientPath, this.buildDir]

  dependencyChecker: SandboxDependencyChecker | undefined
  projectSetupUtil: ProjectSetupUtil | undefined

  loadEnvFunction: () => void = () => { throw new Error('You must set the required config value dotnetReactSandboxConfig.loadEnvFunction (for example, set it to "dotenv.config")') }

  private noDb: boolean = false
  private siteUrl: string | undefined = undefined

  constructor() {
    this.populateCommonCliArgs()
  }

  init(loadEnvFunction: () => void) {
    this.loadEnvFunction = loadEnvFunction
    loadEnvFunction()
    const projectNameFromEnv = process.env.PROJECT_NAME
    if (projectNameFromEnv) {
      this.setProjectNameFields(projectNameFromEnv)
    }
  }

  /**
   * Call this to update projectName and releaseTarballName at the same time.
   * @param newProjectName The projectName to use.
   */
  setProjectNameFields(newProjectName: string) {
    this.projectName = newProjectName
    this.releaseTarballName = `${this.projectName}.tar.gz`
  }

  getDependencyChecker(): SandboxDependencyChecker {
    if (this.dependencyChecker === undefined) {
      this.dependencyChecker = new SandboxDependencyChecker()
    }
    return this.dependencyChecker
  }

  getProjectSetupUtil(): ProjectSetupUtil {
    if (this.projectSetupUtil === undefined) {
      this.projectSetupUtil = new ProjectSetupUtil()
    }
    return this.projectSetupUtil
  }

  // Lazy load this from env
  getSiteUrl(): string {
    if (!this.siteUrl) {
      this.siteUrl = getRequiredEnvVar('SITE_URL')
    }
    return this.siteUrl
  }

  getNoDbVal(): boolean {
    return this.noDb
  }

  private populateCommonCliArgs() {
    if (process.argv[3] && process.argv[3].toLowerCase() === 'nodb') {
      this.noDb = true
    }
  }
}

/**
 * Most of these config values are not meant to be changed. The `projectName` is the main property that will always be different in each project,
 * but that should get pulled in from an env var `PROJECT_NAME`. Under normal circumstances your swigfile will look like this:
 * 
 * @example
 * 
 * ```
 * import dotenv from 'dotenv'
 * import { dotnetReactSandboxConfig } from 'swig-cli-modules/config'
 * 
 * dotnetReactSandboxConfig.init(dotenv.config)
 * 
 * export * from 'swig-cli-modules/DotnetReactSandbox'
 * ```
 */
const dotnetReactSandboxConfig = new SwigDotnetReactSandboxConfig()

export default dotnetReactSandboxConfig
