import DependencyChecker, { StringBoolArray } from '@mikeyt23/node-cli-utils/DependencyChecker'

export default class SandboxDependencyChecker extends DependencyChecker {
  constructor() {
    super()
  }

  async getReport(): Promise<StringBoolArray> {
    const checks = [
      { key: 'Elevated Permissions', check: this.hasElevatedPermissions() },
      { key: 'Dotnet SDK >= 6', check: this.hasDotnetSdkGreaterThanOrEqualTo(6) },
      { key: 'Nodejs >= 18', check: this.hasNodejsGreaterThanOrEqualTo(18) },
      { key: 'Docker', check: this.hasDocker() },
      { key: 'Docker running', check: this.dockerIsRunning() },
      { key: 'Openssl', check: this.hasOpenssl() },
      { key: 'DB_PORT is available', check: this.isPortAvailableByEnvKey('DB_PORT') },
      { key: 'DEV_CLIENT_PORT is available', check: this.isPortAvailableByEnvKey('DEV_CLIENT_PORT') },
      { key: 'DEV_SERVER_PORT is available', check: this.isPortAvailableByEnvKey('DEV_SERVER_PORT') }
    ]

    const report: StringBoolArray = await Promise.all(
      checks.map(async ({ key, check }) => ({
        key,
        value: await check
      }))
    )

    return report
  }

  override async hasElevatedPermissions(): Promise<boolean> {
    return await super.hasElevatedPermissions()
  }
}
