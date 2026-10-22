# Internal Specs Cognito and JumpCloud SSO

## Provisioned bootstrap

On 2026-10-21, the operator applied `infra/cognito.yaml` to account
`012619468172`, region `us-west-2`. Stack `internal-specs-cognito` reached
`CREATE_COMPLETE`; its Hosted UI domain is `ACTIVE`. The reviewed change set
added only a user pool, app client, and domain. Existing service and network
resources were not part of that change set.

| Setting | Value |
| --- | --- |
| User pool | `internal-specs-users` / `us-west-2_Q18L1whbh` |
| App client | `internal-specs-client` / `35vi4dlcdhefcc8pvq56jp8nh3` |
| OIDC issuer | `https://cognito-idp.us-west-2.amazonaws.com/us-west-2_Q18L1whbh` |
| Application callback | `https://internal-specs.wyze.com/api/auth/callback` |
| Application logout destination | `https://internal-specs.wyze.com/` |

The app client uses authorization code flow with `openid email profile` scopes
and a generated server-side client secret. Secret values are not included in
stack outputs or this repository. The client now enables only `jumpcloud`;
self-signup remains disabled. Pool deletion protection and CloudFormation
retention are enabled. JumpCloud owns the MFA and group-assignment policy.

Production uses `AuthMode=oidc` following the authorized operator cutover on
2026-10-22. The service stack is `UPDATE_COMPLETE`, with two healthy replicas
and the existing VPN/office allowlist. `OIDC_CLIENT_SECRET` is populated in the
existing runtime secret; all other fields were preserved. **Assigned-user
login, authenticated spec loading, local sign-out, and repeat sign-in pass.**

## IT metadata and federation

IT supplied the group `wyze-internal-specs-users` and this dedicated metadata URL:

`https://sso.jumpcloud.com/saml2/metadata/6ad9567943ca6f80a6adf8a8`

Verified on 2026-10-22: unauthenticated HTTP 200, email-address NameID, and a
signing certificate valid from 2026-10-22 through 2031-10-22. The metadata's
SSO endpoint is `https://sso.jumpcloud.com/saml2/wyzeinternalsepcs`; preserve
that exact spelling from IT's metadata. Metadata alone cannot verify IT's
configured SP audience, claim values, or user/group assignment.

The operator applied the `jumpcloud` SAML IdP and enabled it on the existing
app client. The reviewed change set added one IdP and modified only the client's
supported providers, with zero replacements or deletions. The stack reached
`UPDATE_COMPLETE`; pool/client IDs and callback URLs remain unchanged.
An authorization-code request with state, nonce, and S256 PKCE redirects from
Cognito to the expected JumpCloud endpoint without a provider-selection screen.
The owner's Work Chrome session completes the provider round trip and opens
the workspace as `cxu@wyze.com` after the mapping correction recorded below.

Email and name map from the claims in the table below. Requests use RSA-SHA256;
unsolicited IdP-initiated login is disabled because the application requires
state/nonce/PKCE. The metadata has no `SingleLogoutService`, so `IDPSignout=false`
preserves the application's existing local-only logout. Do not enable SAML
single logout without compatible metadata and an explicit session-flow review.

## Values to give IT

Use **JumpCloud → Common Requests → IT Change Management Request**, following
[the company SSO runbook](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/4107272200/Runbook+Enable+JumpCloud+SSO+for+an+internal+tool+AWS+Cognito+SAML).
Request a dedicated app; do not reuse another tool's SAML app or metadata.

| Field | Value |
| --- | --- |
| App name | `wyze-internal-specs` |
| SP Entity ID / Audience URI | `urn:amazon:cognito:sp:us-west-2_Q18L1whbh` |
| ACS URL / Reply URL | `https://internal-specs-012619468172.auth.us-west-2.amazoncognito.com/saml2/idpresponse` |
| NameID format | `EmailAddress` |
| Required email claim | `email` → Cognito `email` (verified live) |
| Optional name claim | `name` → Cognito `name` (verified live) |
| Signature algorithm | `RSA-SHA256` |
| Login / tile URL | `https://internal-specs.wyze.com/` |
| Assigned groups/users | `wyze-internal-specs-users`; owner confirmed app assignment and initial tester membership on 2026-10-22 |

Use [the PNG icon](assets/wyze-internal-specs-jumpcloud.png) for the app tile.
The tile should start the application's login flow, which uses state, nonce,
and PKCE. Unsolicited IdP-initiated login has not been implemented or verified.

The tester must be on an approved network to reach Internal Specs; JumpCloud
and the Cognito ACS endpoint do not require adding IT's IP to the application's
allowlist. The owner confirmed IT assigned the group to this application and
added the initial tester, `cxu@wyze.com`, before application cutover.

Security review tracking: [SR-912](https://wyzelabs.atlassian.net/browse/SR-912).
This is tracking, not completed security sign-off.

## Cutover and login verification

The owner confirmed group assignment and initial tester membership before
executing service change set `review-1792691758` on 2026-10-22. Only `AuthMode`,
`OidcIssuer`, and `OidcClientId` changed. Task definition `internal-specs:6`
uses the previously deployed image digest
`sha256:c86b84ce102468d5826ed2b4f5427666fe105f30f917aac2b0ede9e79edf19cf`.
The release verifier confirms two healthy tasks and ALB targets across two AZs.
The six allowed ingress CIDRs remain unchanged.

Live checks pass: health returns 200; auth status reports `oidc`; anonymous
spec/list/team, Ask, and commit requests return 401. A callback without a
handshake is rejected. Login supplies state, nonce, S256 PKCE, and a Secure,
HttpOnly, SameSite=Lax handshake cookie, then redirects through Cognito to
the dedicated JumpCloud endpoint.

The first login failed because the initial URL-formatted claim names did not
match the dedicated JumpCloud application's emitted attributes. At the owner's
request, the operator compared all four Cognito pools in this account/region:
`wyze-service-roadmap-hub`, `spc-staging`, and `wyze-kb-users` all map the SAML
claim `email` to Cognito `email`. The closest reference, `wyze-kb-users`
(`us-west-2_rIbpDzNQf`), also maps `name` to `name` and has populated email
attributes. Its settings were inspected read-only.

Change set `review-1792695010` changed only Internal Specs' IdP
`AttributeMapping` to `email: email` and `name: name`, with no replacement.
Stack `internal-specs-cognito` reached `UPDATE_COMPLETE`. The dedicated metadata,
pool/client IDs, credentials, callback, application image, and network settings
remain unchanged. No IT-side claim change was needed.

The earlier Cognito login session reused the profile without attributes. After
clearing that session and restarting the application's login flow, Cognito
populated both email and name. Browser acceptance with `cxu@wyze.com` passes:
the workspace displays the signed-in email, lists teams/specs, and loads
`specs/services/parent.md`; local sign-out returns to the sign-in screen, and
repeat sign-in succeeds. [Verified workspace](assets/internal-specs-sso-verified.jpg).
Anonymous spec and team requests still return 401. Denial for an unassigned
user and authenticated sandbox writes remain untested.

### Retesting after a claim-mapping change

Use exact emitted SAML attribute names, not examples copied from another IdP;
see [Cognito attribute mapping](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-specifying-attribute-mapping.html).
Do not infer email from a username or bypass the application's email checks.
An existing Cognito session can reuse stale attributes. Sign out locally, visit
the dedicated [Cognito logout endpoint](https://internal-specs-012619468172.auth.us-west-2.amazoncognito.com/logout?client_id=35vi4dlcdhefcc8pvq56jp8nh3&logout_uri=https%3A%2F%2Finternal-specs.wyze.com%2F),
then start a fresh sign-in from the application. This clears this pool's Hosted
UI session without signing out of JumpCloud; SAML single logout remains disabled.
See [AWS logout endpoint documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html).

## Operator maintenance and rollback

```bash
python3 tools/deploy.py validate
python3 tools/deploy.py plan cognito
# Inspect the exact change set before applying; reject unexpected replacements.
python3 tools/deploy.py apply cognito --change-set <reviewed-change-set-arn>
python3 tools/deploy.py status cognito
```

The template defaults `JumpCloudMetadataUrl` to the verified dedicated URL.
An explicit empty value is reserved for an unfederated bootstrap; applying
it after federation removes the IdP and disables client login. Review such
a change as a deliberate teardown, never a routine update.

The main-branch deployment role does not manage Cognito. These commands use the
administrator profile and verify the target account. Routine image releases
preserve application auth settings.

For future service changes, snapshot every current parameter. Preserve the
latest deployed image digest, network, capacity, and other parameters; do not
overlap an automatic image rollout. Inspect the task/service changes before
applying. Routine Cognito maintenance must preserve the pool and client IDs.

Test anonymous rejection, assigned-user login, denial for an unassigned user,
callback validation, sessions/logout, and authenticated API permissions. Local
sessions last eight hours; removing an IdP assignment does not invalidate an
already-issued application session immediately. Keep the VPN/office boundary
in place. Group assignment is owner-confirmed and assigned-user login is
verified; unassigned-user denial and sandbox-write acceptance remain pending.

Keep SSO enforcement enabled for normal operation. Returning to
`test-readonly` would reopen anonymous read/model access within the allowlist;
do that only as a deliberately approved rollback. Use a fresh service-parameter
snapshot and change only the prior auth values (`AuthMode=test-readonly`, empty
issuer/client), retaining the latest image and networking. Keep the federation
resources and secret in place. Pool deletion is intentionally protected and
retained; retirement requires an explicit reviewed operation.
