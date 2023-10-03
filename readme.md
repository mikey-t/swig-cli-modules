# swig-cli-modules

The `swig-cli-modules` package is a collection of utility classes for setting up common swig tasks by project type or other generic grouping.

Swig documentation: https://github.com/mikey-t/swig

Example use: https://github.com/mikey-t/dotnet-react-sandbox ([swigfile.ts](https://github.com/mikey-t/dotnet-react-sandbox/blob/main/swigfile.ts))

## Basic Info and Example

[Swig](https://github.com/mikey-t/swig) is a CLI script that can execute any exported function from a swigfile (which is just a plain javascript or typescript file). To reduce repetition across projects, a "swig cli module" can be created in order to group together related tasks in order to reduce repetition across projects.

A medium-sized project like [dotnet-react-sandbox](https://github.com/mikey-t/dotnet-react-sandbox) might end up having a lot of dev automation tasks spanning several different types of activities. Rather than copy/paste what would normally be a relatively large `swigfile.ts` to each project that is based on the dotnet-react-sandbox template, we can encapsulate the functionality in a swig cli module and then import, configure and re-export all the relevant functions. This is the entire [swigfile.ts](https://github.com/mikey-t/dotnet-react-sandbox/blob/main/swigfile.ts) for a dotnet-react-sandbox project:

```javascript
import dotenv from 'dotenv'
import { dotnetReactSandboxConfig } from 'swig-cli-modules/config'

dotenv.config()

dotnetReactSandboxConfig.projectName = process.env.PROJECT_NAME ?? 'drs'
dotnetReactSandboxConfig.loadEnvFunction = dotenv.config

export * from 'swig-cli-modules/DotnetReactSandbox'

```

## Customization

If you want to run another task before a task from the swig cli module, you can import the function from the module and compose it together with your own like this:

```javascript
import * as swigDocker from 'swig-cli-modules/DockerCompose'
import { swigDockerConfig } from 'swig-cli-modules/config/SwigDockerComposeConfig.js'

swigDockerConfig.dockerComposePath = './docker-compose.yml'

async function runThisFirst() {
  // Do stuff
}

export const dockerUp = series(runThisFirst, swigDocker.dockerUp)

```

## Ejecting

If you start out using a swig cli module and decide it doesn't do what you want, you can "eject" by simply copying and pasting the contents of the file from this library directly into your swigfile and customize it from there.

## Make Your Own Swig CLI Module

You're welcome to create a module within this library, but note that these are simply groups of exported functions, so you could easily create your own library of modules in any location and in any format you like.
