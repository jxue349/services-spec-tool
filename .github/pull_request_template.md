## Change

Describe the problem and resulting behavior. Link the issue, if any.

## Validation

List commands run and their results. Include screenshots for UI changes.

- [ ] Local lint, typecheck, tests, production build/smoke, and dependency audit pass.
- [ ] Deployment/workflow changes include the relevant template and tooling checks.
- [ ] The branch is current with `main`; `application`, `infrastructure`, and `PR gate` pass on the latest PR SHA, and review threads are resolved.

## Deployment and rollback

State whether this is an automatic image release or also needs an operator
infrastructure/configuration change. Describe migration/secret changes, if any,
and how to roll back. Keep secret values out of this PR.

Every main merge, including docs/specs, triggers production deployment. After
merge, monitor the matching main workflow through **Deploy main to ECS** and
record the release link, intended image/task revision, and health result.
PR validation alone does not prove deployment.
