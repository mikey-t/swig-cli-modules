import { spawnAsync, log, emptyDirectory, spawnAsyncLongRunning } from '@mikeyt23/node-cli-utils'
import { series, parallel } from 'swig-cli'
import { config as nodeCliUtilsConfig } from '@mikeyt23/node-cli-utils'
import fsp from 'node:fs/promises'

nodeCliUtilsConfig.traceEnabled = false

const c8Path = './node_modules/c8/bin/c8.js'
const loaderArgsTsx = ['--no-warnings', '--loader', 'tsx']
const loaderArgsTsNode = ['--no-warnings', '--loader', 'ts-node/esm']
const testFiles = [
  './test/Placeholder.test.ts'
]
const adminTestFiles: string[] = []

// Using direct paths to node_modules to skip the startup delay of using npm
const tscPath = './node_modules/typescript/lib/tsc.js'
const eslintPath = './node_modules/eslint/bin/eslint.js'

export const build = series(cleanDist, parallel(buildEsm, series(buildCjs, copyCjsPackageJson)))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

export async function lint() {
  await spawnAsync('node', [eslintPath, '--ext', '.ts', './src', './test', './swigfile.ts'], { throwOnNonZero: true })
}

export async function cleanDist() {
  await emptyDirectory('./dist')
}

export async function test(additionalTestFiles: string[] = []) {
  if ((await spawnAsync('node', [...loaderArgsTsx, '--test', ...testFiles, ...additionalTestFiles])).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testAll() {
  await test(adminTestFiles)
}

export async function testWatch() {
  const args = [...loaderArgsTsx, '--test', '--watch', ...testFiles]
  if ((await spawnAsyncLongRunning('node', args)).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testOnly() {
  const args = [...loaderArgsTsx, '--test-only', '--test', ...testFiles]
  if ((await spawnAsync('node', args)).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testOnlyWatch() {
  const args = [...loaderArgsTsx, '--test-only', '--test', '--watch', ...testFiles]
  if ((await spawnAsyncLongRunning('node', args)).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testCoverage(additionalTestFiles: string[] = []) {
  const args = [c8Path, 'node', ...loaderArgsTsNode, '--test', ...testFiles, ...additionalTestFiles]
  if ((await spawnAsync('node', args, { env: { ...process.env, NODE_V8_COVERAGE: './coverage' } })).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testCoverageOnly() {
  const args = [c8Path, 'node', ...loaderArgsTsNode, '--test-only', '--test', ...testFiles, ...adminTestFiles]
  if ((await spawnAsync('node', args, { env: { ...process.env, NODE_V8_COVERAGE: './coverage' } })).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testCoverageAll() {
  await testCoverage(adminTestFiles)
}

export async function watchEsm() {
  await cleanDist()
  await spawnAsyncLongRunning('node', [tscPath, '--p', 'tsconfig.esm.json', '--watch'])
}

export const publish = series(lint, build, test, () => spawnAsync('npm', ['publish', '--registry=https://registry.npmjs.org/'], { throwOnNonZero: true }))

async function buildEsm() {
  log('Building ESM')
  await spawnAsync('node', [tscPath, '--p', 'tsconfig.esm.json'], { throwOnNonZero: true })
}

async function buildCjs() {
  log('Building CJS')
  await spawnAsync('node', [tscPath, '--p', 'tsconfig.cjs.json'], { throwOnNonZero: true })
}

async function copyCjsPackageJson() {
  await fsp.copyFile('./package.cjs.json', './dist/cjs/package.json')
}
