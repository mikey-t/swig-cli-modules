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

## Alternate to "npm link" For Multi-Chaining

Volta breaks chaining multiple packages such as `package-a` => `package-b` => `package-c`. Instead, run `npm pack` in `package-a`, reference `package-a` tarball in `package-b` package.json, then use `npm link` in `package-b`, then run `npm link package-b` in `package-c`.

Real use case:

- node-cli-utils: `npm pack`
- swig-cli-modules: change `package.json` reference to (with corrected name of tarball):
  ```
  "@mikeyt23/node-cli-utils": "file:../node-cli-utils/mikeyt23-node-cli-utils-2.0.20.tgz"
  ```
- swig-cli-modules: `npm install`, `swig build` or `swig watch`, `npm link`
- db-migrations-dotnet/example-solutions/example-postgres: `npm link swig-cli-modules`

## Manual Testing for `EntityFramework` Swig Module

Some of this is covered by unit tests in the [db-migrations-dotnet](https://github.com/mikey-t/db-migrations-dotnet)  project, and eventually there will be more automated testing, but for now, these are notes on manual testing.

In the db-migrations-dotnet project, use the `example-postgres` project.

Delete the entire migrations project:

`swig deleteMigrationsProject`

Bootstrap the project:

`swig bootstrapMigrationsProject`

Change swig EF module config in `swigfile.ts` and re-run delete and bootstrap.

Use the wrapper command for bootstrapping (`bootstrapMigrationsProject` from example-postgres swigfile instead of ef module exposed method `dbBootstrapMigrationsProject`). This task will sync env files, start docker and run dbSetup.

Some next steps:

- `swig dbAddMigration Initial`
- `swig dbAddMigration AddPerson`
- Add example sql for `AddPerson` in root of example project to newly generated migration up and down scripts
- `swig dbMigrate`
- `swig dbListMigrations`
- `swig dbAddMigration DeleteMe`
- `swig dbRemoveMigration`

Delete the `dotnet-ef` tool for testing it get's installed correctly:

- `dotnet tool uninstall dotnet-ef --local`
- `dotnet tool uninstall dotnet-ef --global`

## Entity Framework Bootstrap Command Notes

Determining which version of the EF Design package to add was complicated because technically .net 8 EF Design works if you add some other dependencies, but the mismatch between what's technically compatible and the EF package versions in MikeyT.DbMigrations caused issues. Instead, I'm just analyzing the transitive dependencies of the newly generated console app after adding MikeyT.DbMigrations and looking for the major version of Microsoft.EntityFrameworkCore and using that for the EF Design package version to add. This way they definitely match up and work together regardless of what version the console app is. So for example, it will now work with .net 6, 7 and 8 without having to do anything special or add additional dependencies. This also future-proofs it since the dependency added will always match the MikeyT.DbMigrations package no matter what (assuming they don't completely restructure how these packages are used).
