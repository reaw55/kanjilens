// Test-only module loader: lets node:test import the app's TypeScript sources directly.
//  - maps the "@/..." path alias to ./src/... (adding the .ts extension Node needs)
//  - maps "server-only" to an empty module (it throws outside a React Server environment)
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
