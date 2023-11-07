# swig-cli-modules Dev Notes

## Misc

Conventions for file names, directory structure and code divisions and exports:

- A "swig module" should usually have the following:
  - A config class under `src/config`
  - A singleton of the config class under `src/config/singleton`
  - An entry in package.json exports for an exported singleton of the config class
  - A typescript file with exported functions that are meant to be re-exported
  - An entry in package.json exports for the swig module's primary typescript file with it's exported swig tasks
- Utility methods can be located in separate files and be exported for project-internal use, for example `YourModuleInternal.ts`
- Keep main swig module files free from exported utility functions and classes/interfaces that aren't swig tasks, and instead:
  - Put utility functions that aren't swig tasks, but that you want consumers to have access to, into files named `YourModuleUtil.ts` and create an entry in package.json exports
  - Put classes and interfaces that a consumer might want but that aren't swig tasks into some other file and then re-export it in `src/types/index.ts`

## Development Pattern

To use npm link to develop swig module functionality:

- Ensure current version of this project and version referenced are the same so npm link works correctly
- In this project, run `npm link`
- In this project, run `swig watch`
- In consuming project, run `npm link swig-cli-modules`

There's some funny business with volta that causes things to not work exactly as expected and to be reverted, so you may have to re-do this setup each time you start working on it.

Undo this setup:
- In consuming project run `npm unlink swig-cli-modules`
- In consuming project, re-add by running `npm i -D swig-cli-modules`
- In this project, run `npm unlink`
