# Pi Remote project instructions

## Canonical host build/install process

After making implementation changes in this repository, run the following command from the repository root before handing the work back:

```bash
node ./build-host.mjs
```

This is the canonical build process for the project. Do not replace it with only `pnpm build` or `tsc`.

The host builder:

- installs the locked workspace dependencies;
- runs the focused tests and all TypeScript checks;
- bundles the Pi Remote extension and its protocol/runtime dependencies into `packages/pi-remote/dist/`;
- installs or refreshes that built directory as a local-path Pi package on the current host;
- installs or updates `@plannotator/pi-extension`.

Because the registered Pi package points at the built `dist` directory, rerunning the command propagates extension changes into the Pi installation on this machine. A Pi process that is already running must still be restarted (or reloaded with Pi's `/reload` command) before it executes the new bundle.

Use `node ./build-host.mjs --skip-tests` only for a deliberate quick local iteration. Run the full command before final verification. Use `--skip-plannotator` only when there is a specific reason not to update Plannotator.

## Windows desktop artifacts

The host builder does not package the Windows desktop application. When a Windows executable is requested, also run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1 -PortableOnly
```

Omit `-PortableOnly` when both the portable executable and NSIS installer are needed.
