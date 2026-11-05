import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const emptyModule = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "stubs", "empty.mjs")).href;

function withTsExtension(base) {
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
        return { url: emptyModule, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
        const file = withTsExtension(path.join(srcDir, specifier.slice(2)));
        if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    // Extensionless relative imports inside src/ (e.g. "./constants").
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL));
        if (parentDir.startsWith(srcDir) && !path.extname(specifier)) {
            const file = withTsExtension(path.resolve(parentDir, specifier));
            if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
        }
    }
    return nextResolve(specifier, context);
}
