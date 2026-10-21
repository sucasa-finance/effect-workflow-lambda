# Releasing effect-workflow-lambda

Tag-driven publishes: pushing `vX.Y.Z` runs CI, then publishes `effect-workflow-lambda@X.Y.Z` to npm (skipped if that version already exists).

## One-time setup

Publishing uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so there is no npm token to create or rotate.

1. On npmjs.com, open `effect-workflow-lambda` → Settings → Trusted Publisher and add GitHub Actions with:
   - organization `sucasa-finance`, repository `effect-workflow-lambda`, workflow `publish.yml`
   - **Allow `npm publish`** ticked
2. `packages/engine/package.json` `repository.url` must stay `git+https://github.com/sucasa-finance/effect-workflow-lambda.git`; npm checks it against the publisher.

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
