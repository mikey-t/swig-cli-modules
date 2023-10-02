import { log } from '@mikeyt23/node-cli-utils'
import path from 'node:path'
import fs from 'node:fs'
import * as certUtils from '@mikeyt23/node-cli-utils/certUtils'
import * as nodeCliUtils from '@mikeyt23/node-cli-utils'

export interface ProjectSetupOptions {
  cwd: string
  generatedCertsDir: string
}

export default class ProjectSetupUtil {
  private readonly cwd: string
  private readonly generatedCertsDir: string

  constructor(options?: Partial<ProjectSetupOptions>) {
    this.cwd = options?.cwd ?? process.cwd()
    this.generatedCertsDir = options?.generatedCertsDir ?? './cert/'

    if (!fs.existsSync(this.cwd) && !nodeCliUtils.isDirectory(this.cwd)) {
      throw new Error('cwd option is invalid - must be an existing directory')
    }
    if (!fs.existsSync(this.generatedCertsDir)) {
      log(`generatedCertsDir does not exist - creating it: ${this.generatedCertsDir}`)
      nodeCliUtils.mkdirpSync(this.generatedCertsDir)
    }
  }

  async ensureCertSetup(url: string) {
    nodeCliUtils.requireString('url', url)
    log('ensuring certificate is setup')
    const hostname = nodeCliUtils.getHostname(url)
    await this.ensureCertFile(hostname)
    await this.installCert(hostname)
  }

  async teardownCertSetup(url: string, deleteCertFiles = true) {
    nodeCliUtils.requireString('url', url)
    log(`uninstalling certificate${deleteCertFiles ? ' and deleting cert files' : ''}`)
    const hostname = nodeCliUtils.getHostname(url)
    await this.uninstallCert(hostname)
    if (deleteCertFiles) {
      const filesToDelete = [`${hostname}.pfx`, `${hostname}.crt`, `${hostname}.key`, `${hostname}.cnf`]
      filesToDelete.forEach(async f => {
        const filePath = path.join(this.generatedCertsDir, f)
        if (fs.existsSync(filePath)) {
          log(`deleting: ${filePath}`)
          fs.rmSync(filePath)
        }
      })
    }
  }

  private async ensureCertFile(hostname: string) {
    const certPath = this.getCertPfxPath(hostname)
    if (fs.existsSync(certPath)) {
      log(`using existing cert file at path ${certPath}`)
      return
    }

    await certUtils.generateCertWithOpenSsl(hostname, { outputDirectory: this.generatedCertsDir })
  }

  private async installCert(hostname: string) {
    if (!nodeCliUtils.isPlatformWindows()) {
      log(`installing certificates is not supported on this platform yet - skipping (see docs for manual instructions)`)
      return
    }

    log('checking if cert is already installed')
    if (await certUtils.winCertIsInstalled(hostname)) {
      log('cert already installed, skipping')
      return
    }

    log('cert is not installed - attempting to install')
    await certUtils.winInstallCert(this.getCertPfxPath(hostname))
  }

  private async uninstallCert(hostname: string) {
    if (!nodeCliUtils.isPlatformWindows()) {
      log(`Uninstalling certificates is not supported on this platform yet - skipping (see docs for manual instructions)`)
      return
    }

    if (!await certUtils.winCertIsInstalled(hostname)) {
      log('cert is not installed, skipping')
      return
    }

    log('attempting to uninstall cert')
    await certUtils.winUninstallCert(hostname)
  }

  private getCertPfxPath(hostname: string) {
    return path.join(this.generatedCertsDir, `${hostname}.pfx`)
  }
}
