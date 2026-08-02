# Named releases

Production web and API builds must consume a selected immutable release, not live upstream responses or mutable `data/dist/`.

Layout:

```text
releases/<release_id>/
  release.json           # release pointer metadata
  manifest.json          # checksums, record counts, publication blockers
  changes.json           # change events vs previous release
  source-health.json       # snapshot health and blockers
  build-manifest.json    # copied dist build manifest
  <consumer artefacts>
releases/CURRENT           # selected release id for integrators
```

Build a release from current canonical source:

```sh
make -C data release
```

Handoff for web (Phase 2 exit, web change deferred):

1. Read `data/releases/CURRENT` for the selected `release_id`.
2. Mount `data/releases/<release_id>/` into `web/public/releases/<release_id>/` (or equivalent).
3. Point map and reachability loaders at release artefacts instead of `web/public/data/` or mutable `data/dist/`.
4. Do not call live NunaGIS fetch during production builds.

Publication blockers in `manifest.json` and `source-health.json` record pending provenance and unknown redistribution status. A release may exist for development while blockers remain; `publish-check` still governs authoritative publication.
