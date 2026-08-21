/**
 * Browser stand-in for Node's `module` builtin.
 *
 * `harfbuzzjs` — the WASM text shaper the docx engine uses for Word-accurate
 * line and page breaks — carries one Node-only branch:
 *
 *     if (ENVIRONMENT_IS_NODE) {
 *       const { createRequire } = await import("module");
 *       ...
 *     }
 *
 * `ENVIRONMENT_IS_NODE` is false in a browser, so that line never runs there.
 * But the import is static enough for a bundler to resolve, and Turbopack fails
 * the client build on it rather than following the guard: "Module not found:
 * Can't resolve 'module'".
 *
 * Aliased for the `browser` condition only (see `turbopack.resolveAlias` in
 * next.config.js), so anything server-side that legitimately needs Node's
 * `module` still gets the real one.
 *
 * The functions throw rather than returning a no-op: reaching them means the
 * environment detection above was wrong, and a silent stub would surface much
 * later as an unexplained font-shaping failure.
 */

function unreachable(name) {
  return function () {
    throw new Error(
      `node:module.${name}() was called in a browser bundle. This stub exists ` +
        "only so bundlers can resolve harfbuzzjs's Node-only branch, which " +
        "should never execute here."
    );
  };
}

const createRequire = unreachable("createRequire");

module.exports = { createRequire, default: { createRequire } };
module.exports.createRequire = createRequire;
