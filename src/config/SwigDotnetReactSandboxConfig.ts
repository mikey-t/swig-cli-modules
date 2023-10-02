import ProjectSetupUtil from '../utils/ProjectSetupUtil.js'
import SandboxDependencyChecker from '../modules/DotnetReactSandbox/SandboxDependencyChecker.js'
import { getRequiredEnvVar } from '@mikeyt23/node-cli-utils'

class SwigDotnetReactSandboxConfig {
  // Need a placeholder for first run before first syncEnvFiles call and generation of .env file
  projectName = process.env.PROJECT_NAME ?? 'drs'

  buildDir = './build'
  buildWwwrootDir = `${this.buildDir}/wwwroot`
  releaseDir = './release'
  dockerPath = './docker'
  serverPath = './server/src/WebServer'
  serverTestPath = `./server/src/WebServer.Test`
  clientPath = './client'
  dbMigratorPath = 'server/src/DbMigrator/'
  dbContainerName = 'postgresql'

  releaseTarballName = `${this.projectName}.tar.gz`
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
    if (process.argv[3] && process.argv[3].toLowerCase() === 'nodb') {
      this.noDb = true
    }
  }

  setOptions(options: Partial<SwigDotnetReactSandboxConfig>) {
    Object.assign(this, options)
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

  getSiteUrl(): string {
    if (!this.siteUrl) {
      this.siteUrl = getRequiredEnvVar('SITE_URL')
    }
    return this.siteUrl
  }
  
  getNoDbVal(): boolean {
    return this.noDb
  }
}

export const dotnetReactSandboxConfig = new SwigDotnetReactSandboxConfig()
