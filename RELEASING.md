# Releasing effect-workflow-lambda

Tag-driven publishes: pushing `vX.Y.Z` runs CI, then publishes `effect-workflow-lambda@X.Y.Z` to npm (skipped if that version already exists).

## One-time setup

1. Create an npm **granular access token** with read/write for `effect-workflow-lambda`
   - https://www.npmjs.com/settings/~/tokens
2. Add it as a repo secret named `NPM_TOKEN`
   - https://github.com/sucasa-finance/effect-workflow-lambda/settings/secrets/actions

## Release checklist

1. On `main` (or a release PR), bump the version in `packages/engine/package.json`
2. Commit, e.g. `chore: release effect-workflow-lambda@0.1.1`
3. Merge to `main` if needed
4. Tag and push from the release commit:

```bash
VERSION=$(node -p "require('./packages/engine/package.json').version")
git tag -a "v$VERSION" -m "effect-workflow-lambda@$VERSION"
git push origin "v$VERSION"
```

5. Confirm the [Publish](../.github/workflows/publish.yml) workflow succeeds
6. Verify: `npm view effect-workflow-lambda version`

## Rules

- Tag must be `v` + exact `package.json` version (`v0.1.1` ↔ `"0.1.1"`)
- Never retag / republish an existing version — bump instead
- Prefer annotated tags (`-a`)
