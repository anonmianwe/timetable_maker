# Teaching block schema

The engine model is built by `buildEngineModel` in
`scripts/anon/src/engine/model.mjs`. Each entry in `model.blocks` is an object
with these fields:

| Field | Type | Required | Evidence |
|---|---|---:|---|
| `id` | string | yes | `scripts/anon/src/engine/model.mjs` block construction |
| `subjectId` | string | yes | same block construction |
| `levelId` | string | yes | same block construction |
| `groupIds` | string[] | yes | same block construction |
| `teacherId` | string | yes | assignment validation and block construction |
| `length` | positive integer | yes | `solver.mjs` placement loops and model validation |
| `kind` | `theory`/`practical`/`activity` | yes | canonical subject validation |
| `category` | `general`/`department` | yes | canonical subject validation |
| `roomClass` | supported room class | yes | `schema.mjs` and model validation |
| `pin` | day/period object or `null` | yes | solver domain construction |
| `sourceRef` | object or `null` | yes | diagnostics and exported schedule |

For the confirmed business rule, a theory or activity subject creates one
merged block for all its groups; a practical subject creates one block per
group. A block is contiguous and is not split.
