const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Compile application TypeScript unchanged and substitute only the native /
// network boundaries. Every test gets an isolated module cache and storage.
function createLoader(mocks = {}) {
  const cache = new Map();
  const load = (request, parent = path.join(root, 'entry.js')) => {
    const absolute = request.startsWith('.') || path.isAbsolute(request)
      ? path.resolve(path.dirname(parent), request) : null;
    if (Object.hasOwn(mocks, request)) return mocks[request];
    if (absolute && Object.hasOwn(mocks, absolute)) return mocks[absolute];
    if (!absolute) return require(request);
    const file = [absolute, `${absolute}.ts`, `${absolute}.tsx`, `${absolute}.json`, path.join(absolute, 'index.ts')]
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!file) throw new Error(`Cannot load ${request} from ${parent}`);
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: file,
    }).outputText;
    const execute = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${code}\n})`, { filename: file });
    execute((name) => load(name, file), mod, mod.exports, file, path.dirname(file));
    return mod.exports;
  };
  return (file) => load(path.resolve(root, file));
}

function storage() {
  const data = new Map();
  const writes = [];
  return {
    data, writes,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { writes.push(key); data.set(key, value); },
    async removeItem(key) { data.delete(key); },
    async multiRemove(keys) { keys.forEach((key) => data.delete(key)); },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
module.exports = { createLoader, storage, deferred, tick, root };
