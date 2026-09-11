# 🧾 Changelog

All notable changes in this project will be documented in this file.


## [4.0.2](https://github.com/omnixys/notification-service/compare/v4.0.1...v4.0.2) (2026-09-11)

### Deps

* **Deps:** update omnixys contracts-ts package ([](https://github.com/omnixys/notification-service/commit/8f04836f8d486ea40d294d54504e72d8b18b21c6))

## [4.0.1](https://github.com/omnixys/notification-service/compare/v4.0.0...v4.0.1) (2026-09-10)

### Deps

* **Deps:** update graphql-ts ([](https://github.com/omnixys/notification-service/commit/9fdd1849d088b6ef44cda39bdb814fb5e9df4527))

## [4.0.0](https://github.com/omnixys/notification-service/compare/v3.6.0...v4.0.0) (2026-09-05)

### Deps

* **Deps:** update omnixys deps ([](https://github.com/omnixys/notification-service/commit/25ff67628fefe8a3eb280f3306bbfd77fa0a90ef))

### Identity

* **Identity:** document U/K identity conventions in AGENTS.md ([](https://github.com/omnixys/notification-service/commit/0899723795e8bfa1a18494e1a2a5a01edbb88508))
* **Identity:** replace string literals in UUID columns, fail-closed on missing ACTOR_ID, validate createdBy UUID ([](https://github.com/omnixys/notification-service/commit/a0613dd49485ec687976f12a3a5bb612b011ecc7))

### Logging

* **Logging:** add service:notification provenance source to logger acquisitions ([](https://github.com/omnixys/notification-service/commit/dab7431fb093cbeea96013291a13857a752d3960))
* **Logging:** add missing format placeholders to structured log calls ([](https://github.com/omnixys/notification-service/commit/56113c8890899af8802e6a9dcb69a17f8ddbc051))

### Notification

* **Notification:** rewire omnixys service deps to file: ([](https://github.com/omnixys/notification-service/commit/7d2a7dd65d8be6d451712279549f011b573ea934))
* **Notification:** type identity reference fields as UUID ([](https://github.com/omnixys/notification-service/commit/ec54264358eafc4756f5c5e21afb3c88ff77c9fe))
* **Notification:** send UUIDv7 senderId to gateway for EMAIL dispatch ([](https://github.com/omnixys/notification-service/commit/1961e44abd7a84947dc1955805566c28e69dd5e9))

### Other

* **Other:** Merge pull request #1 from omnixys/migration/uuid-v7 ([](https://github.com/omnixys/notification-service/commit/ea1dda57319e24b50224f5150d4778980567c01d)), closes [#1](https://github.com/omnixys/notification-service/issues/1)

### Runtime

* **Runtime:** require node 26.8.1 and pnpm 11.24.0 ([](https://github.com/omnixys/notification-service/commit/a404d3d21014a4eb579ffba94c537b3dc36fdb19))

## [3.6.0](https://github.com/omnixys/notification-service/compare/v3.5.0...v3.6.0) (2026-08-30)

### Support

* **Support:** add support chat ([](https://github.com/omnixys/notification-service/commit/293856780f3e6dfa3f268ab1b43315268fd49f4d))

## [3.5.0](https://github.com/omnixys/notification-service/compare/v3.4.4...v3.5.0) (2026-08-28)

### Deps

* **Deps:** update contracts-ts ([](https://github.com/omnixys/notification-service/commit/975c820e0c149cfcc8e3e8eae6eab4f3447e3d11))

### Guests

* **Guests:** preserve verified tenant during signup ([](https://github.com/omnixys/notification-service/commit/da07bc7b0ec90f1c3ad556a94e8dd15bea88ed28))

### Support

* **Support:** secure event guest conversations ([](https://github.com/omnixys/notification-service/commit/0372e1f21b8242142a576ef764b5777533fa8cc7))

## [3.4.4](https://github.com/omnixys/notification-service/compare/v3.4.3...v3.4.4) (2026-08-26)

### Build

* **Build:** fix build errors ([](https://github.com/omnixys/notification-service/commit/a0de4748fba25fd5bdb0daef34e4fb95bd3b6059))

## [3.4.3](https://github.com/omnixys/notification-service/compare/v3.4.2...v3.4.3) (2026-08-26)

### Build

* **Build:** fix build errors ([](https://github.com/omnixys/notification-service/commit/87117e61efc02d6046f41398b4a6b254f6115115))

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/a34a42ec39902502c515e7d698b26cd67cac9f9d))

## [3.4.2](https://github.com/omnixys/notification-service/compare/v3.4.1...v3.4.2) (2026-08-26)

### Build

* **Build:** fix build errors ([](https://github.com/omnixys/notification-service/commit/37c4b63f963c44c84911690ebe537a1e9c4f7707))

## [3.4.1](https://github.com/omnixys/notification-service/compare/v3.4.0...v3.4.1) (2026-08-26)

### Deps

* **Deps:** update logger to 3.2.6 ([](https://github.com/omnixys/notification-service/commit/06a8f08e442445035763ed373157182ccee727f1))
* **Deps:** update shared TypeScript packages ([](https://github.com/omnixys/notification-service/commit/241ef56e8a91c813567d5f7cc2760a31e5843df3))

## [3.4.0](https://github.com/omnixys/notification-service/compare/v3.3.3...v3.4.0) (2026-08-26)

### Deps

* **Deps:** update omnixys ts packages ([](https://github.com/omnixys/notification-service/commit/d018e38ee8f065e6e670c3e5977d626a1ecf311b))

### Otel

* **Otel:** add otel logs ([](https://github.com/omnixys/notification-service/commit/1cb2c3b60f1fa9dcdc4000e315c16f296fd96cc2))

## [3.3.3](https://github.com/omnixys/notification-service/compare/v3.3.2...v3.3.3) (2026-08-23)

### Logger

* **Logger:** fix terminal logger ([](https://github.com/omnixys/notification-service/commit/b2c36a945093484714d4efeef9a05f076c80c13f))

## [3.3.2](https://github.com/omnixys/notification-service/compare/v3.3.1...v3.3.2) (2026-08-23)

### Observability

* **Observability:** update dependency ([](https://github.com/omnixys/notification-service/commit/2274db38c00fe89ba38c0ae3d1af735145882266))

## [3.3.1](https://github.com/omnixys/notification-service/compare/v3.3.0...v3.3.1) (2026-08-19)

### Agent

* **Agent:** add repository development instructions ([](https://github.com/omnixys/notification-service/commit/4e30f926817005ced823b1150a5437d40b271472))

### Build

* **Build:** replace deprecated rate-limit skip with allowList and exclude generated files from prettier ([](https://github.com/omnixys/notification-service/commit/af1b781e5cdbb6842d0e80ad027d322770e3f98e))

### Notification

* **Notification:** exclude health endpoints from rate-limit and bump version ([](https://github.com/omnixys/notification-service/commit/cf5b223652f249135b1ebb933b8a3b617a0488d1))

## [3.3.0](https://github.com/omnixys/notification-service/compare/v3.2.0...v3.3.0) (2026-08-03)

### Analytics

* **Analytics:** publish notification outcomes via outbox ([](https://github.com/omnixys/notification-service/commit/14ab20d47e9bf29fd64764690b1c3f6032d8daa5))

### Config

* **Config:** require and validate DEFAULT_TENANT_ID ([](https://github.com/omnixys/notification-service/commit/f118cbde35cf5c79f8265e781f0a07337ca2bc84))
* **Config:** support trusted proxy address policy ([](https://github.com/omnixys/notification-service/commit/d7b607daf5c0d6dbe35de82900a6e7830a12d7e2))

### Errors

* **Errors:** adopt secure notification error handling ([](https://github.com/omnixys/notification-service/commit/a8b7ad5ab015174bc9421ad8a9173eb1eb0241cf))

### Tenant

* **Tenant:** migrate legacy 'omnixys' tenant identifier to canonical UUID ([](https://github.com/omnixys/notification-service/commit/291e8aff222dab8e0a8ef674797ded1fb1abaeda))
* **Tenant:** use DEFAULT_TENANT_ID instead of hardcoded 'omnixys' ([](https://github.com/omnixys/notification-service/commit/4ebc4e2f24483e4435b8404304795336a98cda3b))

## [3.2.0](https://github.com/omnixys/notification-service/compare/v3.1.0...v3.2.0) (2026-07-28)

### Notification

* **Notification:** add structured logging to support module services and resolvers ([](https://github.com/omnixys/notification-service/commit/58ab8f715ea766d5c7d1291ffc79426ddf0f7c29))
* **Notification:** enable RequestLoggerMiddleware, fix fire-and-forget handlers with try/catch ([](https://github.com/omnixys/notification-service/commit/a658ad46c533338afa92d0f513edceb73eaf93e8))

### Other

* **Other:** resolve all lint and build errors ([](https://github.com/omnixys/notification-service/commit/723531cb4793bc42ee482da743e76c957feb13ac)), closes [#logger](https://github.com/omnixys/notification-service/issues/logger)
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/ab5e82edf1c736ecd4ced5df8e4d619f1af6cb90))

### Prisma

* **Prisma:** add generated prisma files ([](https://github.com/omnixys/notification-service/commit/7b0803d47973368e606df4dcd1cb7a932a2fc003))

## [3.1.0](https://github.com/omnixys/notification-service/compare/v3.0.0...v3.1.0) (2026-07-24)

### Deps

* **Deps:** remove obsolete/redundant dependencies ([](https://github.com/omnixys/notification-service/commit/0fdf543ced511fe02c8b25be548234480ab0c31b))

### Log

* **Log:** remove logstream dep ([](https://github.com/omnixys/notification-service/commit/cf782338e1bbc38bcf0d3103d7169b2db615b68f))

### Logger

* **Logger:** remove Kafka log transport config ([](https://github.com/omnixys/notification-service/commit/07697494c3bb620845a7e7605b2ec7c8ce80fba9))

## [3.0.0](https://github.com/omnixys/notification-service/compare/v2.1.0...v3.0.0) (2026-07-16)

### New

* **New:** new service ([](https://github.com/omnixys/notification-service/commit/c8f4e826eb1da169aeb385c11e1e87357d6bb20b))

## [2.1.0](https://github.com/omnixys/notification-service/compare/v2.0.1...v2.1.0) (2026-07-02)

### Deps

* **Deps:** update dependencys ([](https://github.com/omnixys/notification-service/commit/2b9bb73716940186c5c2d887e628f8a70603a77b))

## [2.0.1](https://github.com/omnixys/notification-service/compare/v2.0.0...v2.0.1) (2026-06-29)

### Kafka

* **Kafka:** update kafka dependency ([](https://github.com/omnixys/notification-service/commit/71372d8c619a7bcc6bbd4c2ac3bcb476e3e0a782))

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/3601c02f84edaf339da8b11cb9affa817312c834))

## [2.0.0](https://github.com/omnixys/notification-service/compare/v1.0.2...v2.0.0) (2026-06-28)

### Dependencies

* **Dependencies:** update Dependecies ([](https://github.com/omnixys/notification-service/commit/2a2dec0663106d1538beba14ff10dd6effd7d49b))

### Log

* **Log:** add logs ([](https://github.com/omnixys/notification-service/commit/5424f5272d24bf4cd68d8fee441db7f2607a6852))

### Notification

* **Notification:** emit typed domain errors ([](https://github.com/omnixys/notification-service/commit/250361da59418d442f3a8563ccf47bbc0dc985af))
* **Notification:** harden delivery context and lifecycle ([](https://github.com/omnixys/notification-service/commit/616434d9ca4ef8580dc6830be983f18e515958d5))
* **Notification:** eliminate WhatsApp provider bypass and retry loops ([](https://github.com/omnixys/notification-service/commit/b62e3993a951fef31380ab6149bdfc79641e5162))
* **Notification:** preserve whatsapp web session and prefer web provider ([](https://github.com/omnixys/notification-service/commit/5317670986b8207001894764740a365b03cec2ff))
* **Notification:** stabilize whatsapp web provider resolution ([](https://github.com/omnixys/notification-service/commit/1ee3621bf8563903ca9be57187e7b927a4c5da73))

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/7123515ffd4d2598c70822e6ca190ed4a6dc8065))

## [1.0.2](https://github.com/omnixys/notification-service/compare/v1.0.1...v1.0.2) (2026-05-25)

### Docker

* **Docker:** Dockerfile ([](https://github.com/omnixys/notification-service/commit/942d90c6474b29cd3a5af695a06563f4dbdd1f2d))

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/4a5f22a02f8a64eb950349c234e660faa3d0edbf))

## [1.0.1](https://github.com/omnixys/notification-service/compare/v1.0.0...v1.0.1) (2026-05-24)

### Docker

* **Docker:** fix pnpm version ([](https://github.com/omnixys/notification-service/commit/9aa56abd71eb40855126345f476331e2982a9158))

### Prisma

* **Prisma:** update prisma schema ([](https://github.com/omnixys/notification-service/commit/f37e23d3e94cddee921d22654aee788a4747579e))

## 1.0.0 (2026-05-01)

### 1.0.0

* **1.0.0:** Remove legacy workflows and update notifications ([](https://github.com/omnixys/notification-service/commit/7c706361b425b71e8e106f78371cd1f159ae34ff))

### Ci

* **Ci:** add ci jobs ([](https://github.com/omnixys/notification-service/commit/67f075ba41555bbfbfeb66aaa48a179f178727c1))
* **Ci:** update release.yml ([](https://github.com/omnixys/notification-service/commit/35b2fe3067c2b16e7f4da84f4d09cd253634d239))

### Dockerfile

* **Dockerfile:** add private npm auth and update Dockerfile & deps ([](https://github.com/omnixys/notification-service/commit/7798b007d311633d3160115bee2ebf646bd8ab01))

### Other

* **Other:** add CookieAuthGuard ([](https://github.com/omnixys/notification-service/commit/cebd8d6fcc8107ec8c0d809a3424dda3bd09b086))
* **Other:** add notification methods ([](https://github.com/omnixys/notification-service/commit/5c1c206c552fec1dca5730d4c89b3be1c5be9a4f))
* **Other:** add Status ARCHIVED ([](https://github.com/omnixys/notification-service/commit/3b77aa3bb310c826a7d0a032f7b5f480524d0a21))
* **Other:** Create deploy.yml ([](https://github.com/omnixys/notification-service/commit/94752c775804e565492c7126016b2b625587062c))
* **Other:** Initial commit ([](https://github.com/omnixys/notification-service/commit/523a157a82e42686bb2614f537b4435ad897da81))
* **Other:** lint fix ([](https://github.com/omnixys/notification-service/commit/0ffe12b01ce6fe59f5db3743ed27cf67fbf18c9f))
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/9a54f2da092cce5567cb8d64a7d4ea22ea98e581))
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/d0d5189cbe54c420d333ba9813b50cff540a78ce))
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/00bdc8e33826a4efa4fc32d73e1283910d0bcb82))
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/fc9abdabc3974d915af4207ac681dedea9892535))
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/a8c209e372d2121a6b2a8a0e187cd425a7cc1ce1))
* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/04ce9a2914b8b3a64d959e253e2ef146169c073b))
* **Other:** Update deploy.yml ([](https://github.com/omnixys/notification-service/commit/3420393f5a0ac902a4deb113edffabad622178e6))
* **Other:** Update docker-build.yaml ([](https://github.com/omnixys/notification-service/commit/2b0b8a56a49e4d7cb2e1f2f71cd61d54e8b05be8))
* **Other:** Update Dockerfile ([](https://github.com/omnixys/notification-service/commit/5da5a3ec50b1de6be7e0a6f1ebf6abe7a71336fb))
* **Other:** Update notification-mutation.resolver.ts ([](https://github.com/omnixys/notification-service/commit/ae97ffcde12bc4809cfeedbcb7e98e40e4f5863f))
* **Other:** Update notification-write.service.ts ([](https://github.com/omnixys/notification-service/commit/42c6fa74e2c33dfe445d7ae8a69b2d111c887051))
* **Other:** Update package.json ([](https://github.com/omnixys/notification-service/commit/0373f0b994be6c7d7375ca8edca5dee57ce26d81))

### Package.json

* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/53e2aee3107f3b0985016ca1fee4ab654f30d7b7))
* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/a357c3bb40e1887b2fda8d716b2a5fee06460d06))
* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/5bce90a73eccab65fbc31313d960e13979239444))
* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/77980b2b3e060926f709e5b6a68c4127d0d6e9c5))
* **Package.json:** Update workflow trigger and package description ([](https://github.com/omnixys/notification-service/commit/56947d2ea698831d9f8a17ac60bfe755c97f3e56))

### Register

* **Register:** add register flow ([](https://github.com/omnixys/notification-service/commit/e60465093aa3c13868c5e13473ae7ebb7ffd50c7))

### Release

* **Release:** v1.0.0 ([](https://github.com/omnixys/notification-service/commit/e1a5996b2b78a5ff9a870fa589aa3c6996a5daea))
* **Release:** 1.0.0 [skip ci] ([](https://github.com/omnixys/notification-service/commit/8b1b8bd01eaa91a4d13546c932abce755e9650a2))
* **Release:** 1.0.1 [skip ci] ([](https://github.com/omnixys/notification-service/commit/185ed215c8830ce324e17beb237b5f9cb249b14e))
* **Release:** 2.0.0 [skip ci] ([](https://github.com/omnixys/notification-service/commit/a533b6cf35e3e05506534348d37b1f308bdca526))
* **Release:** 3.0.0 [skip ci] ([](https://github.com/omnixys/notification-service/commit/ed6d8fd58523a8cc0cd5bc4602469f044ef5a820))
* **Release:** 3.0.1 [skip ci] ([](https://github.com/omnixys/notification-service/commit/5a4490197b15533b50db68ee3a25f0e8f3aa6ddd))
* **Release:** 3.0.2 [skip ci] ([](https://github.com/omnixys/notification-service/commit/8bc9e8380737d660b06454c854383aba4515a4fe))
* **Release:** 3.0.3 [skip ci] ([](https://github.com/omnixys/notification-service/commit/f0a5dec33b54186d41637a4015ac46c9c5430c79))
* **Release:** update ([](https://github.com/omnixys/notification-service/commit/83ca7547359d13d72ebf4e6c860ea6e076e96795))

### Schema

* **Schema:** new schema ([](https://github.com/omnixys/notification-service/commit/ef2f754547e374ca03637b0a07a3a269e3ff0d1d))

### Service

* **Service:** update service ([](https://github.com/omnixys/notification-service/commit/bd7bf168f507eabc52a876589266843d10d82a1d))
* **Service:** major Service update ([](https://github.com/omnixys/notification-service/commit/1adfe7d5a9dc2cb642b0e8c967661c55d9bafa4f))
* **Service:** major Service update ([](https://github.com/omnixys/notification-service/commit/f0b55fbe8bdf8c95262011a9af08996ad0db3260))

### Template

* **Template:** add new Templates ([](https://github.com/omnixys/notification-service/commit/599c04f8a63f1a7120c603db728b9f3ca730ce91))

### Update

* **Update:** update @omnixys/graphql ([](https://github.com/omnixys/notification-service/commit/eecceacd2ac59758153ec332d450eb18c4494dc9))

### Whatsapp

* **Whatsapp:** add whatsappweb support ([](https://github.com/omnixys/notification-service/commit/b589e677a8c82857f97be89c18cec7d13ab89f08))

## [3.0.3](https://github.com/omnixys/notification-service/compare/v3.0.2...v3.0.3) (2026-03-13)

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/d0d5189cbe54c420d333ba9813b50cff540a78ce))

### Service

* **Service:** major Service update ([](https://github.com/omnixys/notification-service/commit/1adfe7d5a9dc2cb642b0e8c967661c55d9bafa4f))

## [3.0.2](https://github.com/omnixys/notification-service/compare/v3.0.1...v3.0.2) (2026-03-13)

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/00bdc8e33826a4efa4fc32d73e1283910d0bcb82))

### Service

* **Service:** major Service update ([](https://github.com/omnixys/notification-service/commit/f0b55fbe8bdf8c95262011a9af08996ad0db3260))

## [3.0.1](https://github.com/omnixys/notification-service/compare/v3.0.0...v3.0.1) (2026-03-13)

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/fc9abdabc3974d915af4207ac681dedea9892535))

### Update

* **Update:** update @omnixys/graphql ([](https://github.com/omnixys/notification-service/commit/eecceacd2ac59758153ec332d450eb18c4494dc9))

## [3.0.0](https://github.com/omnixys/notification-service/compare/v2.0.0...v3.0.0) (2026-03-12)

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/a8c209e372d2121a6b2a8a0e187cd425a7cc1ce1))

### Service

* **Service:** update service ([](https://github.com/omnixys/notification-service/commit/bd7bf168f507eabc52a876589266843d10d82a1d))

## [2.0.0](https://github.com/omnixys/notification-service/compare/v1.0.1...v2.0.0) (2026-03-12)

### Ci

* **Ci:** update release.yml ([](https://github.com/omnixys/notification-service/commit/35b2fe3067c2b16e7f4da84f4d09cd253634d239))

### Other

* **Other:** Merge branch 'main' of https://github.com/omnixys/notification-service ([](https://github.com/omnixys/notification-service/commit/04ce9a2914b8b3a64d959e253e2ef146169c073b))

### Schema

* **Schema:** new schema ([](https://github.com/omnixys/notification-service/commit/ef2f754547e374ca03637b0a07a3a269e3ff0d1d))

### Template

* **Template:** add new Templates ([](https://github.com/omnixys/notification-service/commit/599c04f8a63f1a7120c603db728b9f3ca730ce91))

## [1.0.1](https://github.com/omnixys/notification-service/compare/v1.0.0...v1.0.1) (2026-03-10)

### Package.json

* **Package.json:** Update workflow trigger and package description ([](https://github.com/omnixys/notification-service/commit/56947d2ea698831d9f8a17ac60bfe755c97f3e56))

## 1.0.0 (2026-03-10)

### Ci

* **Ci:** add ci jobs ([](https://github.com/omnixys/notification-service/commit/67f075ba41555bbfbfeb66aaa48a179f178727c1))

### Dockerfile

* **Dockerfile:** add private npm auth and update Dockerfile & deps ([](https://github.com/omnixys/notification-service/commit/7798b007d311633d3160115bee2ebf646bd8ab01))

### Other

* **Other:** add CookieAuthGuard ([](https://github.com/omnixys/notification-service/commit/cebd8d6fcc8107ec8c0d809a3424dda3bd09b086))
* **Other:** add notification methods ([](https://github.com/omnixys/notification-service/commit/5c1c206c552fec1dca5730d4c89b3be1c5be9a4f))
* **Other:** add Status ARCHIVED ([](https://github.com/omnixys/notification-service/commit/3b77aa3bb310c826a7d0a032f7b5f480524d0a21))
* **Other:** Create deploy.yml ([](https://github.com/omnixys/notification-service/commit/94752c775804e565492c7126016b2b625587062c))
* **Other:** Initial commit ([](https://github.com/omnixys/notification-service/commit/523a157a82e42686bb2614f537b4435ad897da81))
* **Other:** lint fix ([](https://github.com/omnixys/notification-service/commit/0ffe12b01ce6fe59f5db3743ed27cf67fbf18c9f))
* **Other:** Update deploy.yml ([](https://github.com/omnixys/notification-service/commit/3420393f5a0ac902a4deb113edffabad622178e6))
* **Other:** Update docker-build.yaml ([](https://github.com/omnixys/notification-service/commit/2b0b8a56a49e4d7cb2e1f2f71cd61d54e8b05be8))
* **Other:** Update Dockerfile ([](https://github.com/omnixys/notification-service/commit/5da5a3ec50b1de6be7e0a6f1ebf6abe7a71336fb))
* **Other:** Update notification-mutation.resolver.ts ([](https://github.com/omnixys/notification-service/commit/ae97ffcde12bc4809cfeedbcb7e98e40e4f5863f))
* **Other:** Update notification-write.service.ts ([](https://github.com/omnixys/notification-service/commit/42c6fa74e2c33dfe445d7ae8a69b2d111c887051))
* **Other:** Update package.json ([](https://github.com/omnixys/notification-service/commit/0373f0b994be6c7d7375ca8edca5dee57ce26d81))

### Package.json

* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/53e2aee3107f3b0985016ca1fee4ab654f30d7b7))
* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/a357c3bb40e1887b2fda8d716b2a5fee06460d06))
* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/5bce90a73eccab65fbc31313d960e13979239444))
* **Package.json:** update pnpm lockfile ([](https://github.com/omnixys/notification-service/commit/77980b2b3e060926f709e5b6a68c4127d0d6e9c5))

### Register

* **Register:** add register flow ([](https://github.com/omnixys/notification-service/commit/e60465093aa3c13868c5e13473ae7ebb7ffd50c7))

### Release

* **Release:** update ([](https://github.com/omnixys/notification-service/commit/83ca7547359d13d72ebf4e6c860ea6e076e96795))

## <small>1.0.1 (2025-11-07)</small>

- Initial commit ([135641e](https://github.com/omnixys/omnixys-event-service/commit/135641e))

## <small>1.0.1 (2025-11-06)</small>

- chore(dev): integrate custom Commitlint formatter with Husky hook ([1cc0034](https://github.com/omnixys/omnixys-event-service/commit/1cc0034))

## 1.0.0 (2025-11-06)

- chore(ci): add GPL-3.0-or-later license header to all GitHub workflow files ([4b5488c](https://github.com/omnixys/omnixys-event-service/commit/4b5488c))
- chore(dev): integrate Husky pre-commit and commit-msg hooks for code quality ([261f18f](https://github.com/omnixys/omnixys-event-service/commit/261f18f))
- Initial commit ([7c74f0b](https://github.com/omnixys/omnixys-event-service/commit/7c74f0b))
- Update CHANGELOG.md ([e8b2951](https://github.com/omnixys/omnixys-event-service/commit/e8b2951))
- Update package.json ([f180269](https://github.com/omnixys/omnixys-event-service/commit/f180269))
