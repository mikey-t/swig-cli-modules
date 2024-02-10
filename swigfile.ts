import { emptyDirectory, log, config as nodeCliUtilsConfig, spawnAsync, spawnAsyncLongRunning } from '@mikeyt23/node-cli-utils'
import fsp from 'node:fs/promises'
import { parallel, series } from 'swig-cli'

nodeCliUtilsConfig.traceEnabled = false

const c8Path = './node_modules/c8/bin/c8.js'
const loaderArgsTsx = ['--no-warnings', '--import', 'tsx']
const loaderArgsTsNode = ['--no-warnings', '--experimental-loader', 'ts-node/esm']
const testFiles = [
  './test/Placeholder.test.ts'
]

// Using direct paths to node_modules to skip the startup delay of using npm
const tscPath = './node_modules/typescript/lib/tsc.js'
const eslintPath = './node_modules/eslint/bin/eslint.js'

export const build = series(cleanDist, parallel(buildEsm, series(buildCjs, copyCjsPackageJson)))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

export async function lint() {
  await spawnAsync('node', [eslintPath, '--ext', '.ts', './src', './test', './swigfile.ts'])
}

export async function cleanDist() {
  await emptyDirectory('./dist')
}

export async function test() {
  if ((await spawnAsync('node', [...loaderArgsTsx, '--test', ...testFiles], { throwOnNonZero: false })).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testWatch() {
  const args = [...loaderArgsTsx, '--test', '--watch', ...testFiles]
  await spawnAsyncLongRunning('node', args)
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

export async function watch() {
  await doWatch('tsconfig.esm.json')
}

export async function watchCjs() {
  await doWatch('tsconfig.cjs.json')
}

export const publish = series(lint, build, test, () => spawnAsync('npm', ['publish', '--registry=https://registry.npmjs.org/']))

async function doWatch(tsconfig: string) {
  await cleanDist()
  await spawnAsyncLongRunning('node', [tscPath, '--p', tsconfig, '--watch'])
}

async function buildEsm() {
  log('Building ESM')
  await spawnAsync('node', [tscPath, '--p', 'tsconfig.esm.json'])
}

async function buildCjs() {
  log('Building CJS')
  await spawnAsync('node', [tscPath, '--p', 'tsconfig.cjs.json'])
}

async function copyCjsPackageJson() {
  await fsp.copyFile('./package.cjs.json', './dist/cjs/package.json')
}
