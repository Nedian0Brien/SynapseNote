import pkgJson from '../package.json' with { type: 'json' };

/** Root directory name for synapsenote inside a project. */
export { OK_DIR } from '@nedian0brien/synapsenote-core';

/** Workspace-level config file inside the synapsenote directory. */
export const CONFIG_FILENAME = 'config.yml';

export const PACKAGE_VERSION = pkgJson.version;
