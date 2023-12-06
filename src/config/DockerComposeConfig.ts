import { FuncOrAsyncFunc } from '@mikeyt23/node-cli-utils'

export class DockerComposeConfig {
  dockerComposePath: string = './docker-compose.yml'
  private _beforeHooks: FuncOrAsyncFunc<unknown>[] = []

  get beforeHooks(): FuncOrAsyncFunc<unknown>[] {
    return [...this._beforeHooks]
  }

  addBeforeHook = (func: FuncOrAsyncFunc<unknown>) => {
    this._beforeHooks.push(func)
  }
}
