import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string; description: string };

export const VERSION = pkg.version;
export const DESCRIPTION = pkg.description;
