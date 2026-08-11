# Staged for `aexy-io/mcp-server`

The MCP server is a separate repo. `dump_tool_manifest.py` belongs there, not
here — it is staged in this directory only so the change that consumes its
output and the change that produces it can be reviewed together.

## Applying it upstream

```bash
cp scripts/mcp-server-upstream/dump_tool_manifest.py <mcp-server>/scripts/
cd <mcp-server> && uv run python scripts/dump_tool_manifest.py > tools.json
```

Then, upstream:

1. Commit `tools.json` at the repo root.
2. Attach it to every release as a named asset (`tools.json`), so consumers can
   fetch a pinned version without cloning.
3. Add a CI step asserting the committed manifest is current:

   ```bash
   uv run python scripts/dump_tool_manifest.py | diff -u tools.json - \
     || { echo "tools.json is stale — regenerate it"; exit 1; }
   ```

Until step 2 exists, this repo consumes the copy committed at
`frontend/src/config/mcpTools.generated.json`, refreshed by
`frontend/scripts/fetch-tool-manifest.mjs`. That script already prefers the
release asset and only falls back to the raw default branch, so it starts
working against pinned releases the moment upstream publishes one.

## Why the manifest exists

`frontend/src/app/(app)/mcp/page.tsx` used to carry a hand-copied array of tool
names, with the matching descriptions hand-copied again into
`messages/{en,hi}/mcp.json`. Its own comment conceded the list was not
generated and had to be updated by hand whenever a tool changed upstream. Two
repos, three copies, no test — the same shape of problem
`backend/scripts/dump_app_catalog.py` was written to solve for the app catalog.
