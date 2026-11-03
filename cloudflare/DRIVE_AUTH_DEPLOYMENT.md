# Drive automatic reconnection: deployment and acceptance

Status as of 2026-11-04: the production Pages workflow builds with
`VITE_DRIVE_GRANT_BACKEND=enabled` (introduced in v0.56.28), and the public
update channel reported v0.56.32. The Cloudflare gateway is deployed separately;
its current deployment ID must be checked before any gateway change.

An authenticated isolated acceptance page successfully authorized Google,
read Drive and restored the grant. A separate synthetic Drive file was created,
updated and read back through that grant. In a real frontend acceptance session,
a user-created test project was saved to Drive, then a second private-browsing
tab displayed the signed-in account and saved-to-Drive status. These checks do
not establish uninterrupted authorization after expiry or revocation, nor do
they by themselves prove a production cross-account edit cycle.

On the production v0.56.31 sharing path, another browser profile opened that
link-viewable test file without signing in and displayed its one object. Selecting
“sign in to edit” retained the file ID in the URL and presented the sign-in
screen. On v0.56.32, the signed-in owner opened the same test file from its
public view into the editor: its file ID and one object were retained, and
Google Drive showed as connected. No file content or sharing permissions were
modified during that check. The authenticated non-owner viewer and
permission-request path remains unverified.

The Drive readback client uses no-cache bounded retries and checks the original
file bytes against SHA-256 when Drive provides a checksum. Where a checksum is
unavailable, matching version metadata remains an eventual-consistency
assumption. The gateway serves OAuth completion assets; verify their status
again when changing the deployment.

## Dependencies and secrets

- The Google OAuth web client needs the exact authorized redirect URI
  `https://infinite.petfashion.tw/api/drive/oauth/callback`. Existing origins,
  redirect URIs, client secrets and Drive permission scopes must be preserved.
- Configure Worker secrets `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `FIREBASE_WEB_API_KEY`, `DRIVE_STATE_KEY`,
  `DRIVE_VAULT_KEY`, and `DRIVE_VAULT_KEY_ID`. State and vault keys must be
  independently generated 32-byte base64url values. Do not print or commit
  values. Verify the Firebase key permits server-side Identity Toolkit lookup.
- `wrangler.drive-draft.jsonc` describes the intended Durable Object binding
  and migration. Before applying it, inspect the existing gateway's current
  deployment, custom-domain routing and rollback procedure. Wrangler access
  must be sufficient for the binding, migration and secrets.
- On 2026-11-04, the production dashboard reported compatibility date
  `2026-10-19`, with no existing Durable Object bindings; the draft matches
  that date. The then-current deployment was
  `e028adba-5f15-4503-9628-6cf19c38c424`. Recheck both immediately before
  deployment: they are observations, not a substitute for a rollback test.
- To rotate a vault key, retain up to four old keys in the secret JSON map
  `DRIVE_VAULT_PREVIOUS_KEYS` keyed by their old IDs. Newly refreshed grants
  are re-encrypted using the active key. Removing an old key prematurely
  forces affected users to reconnect.

## Acceptance and recovery

- 2026-11-04: fixed Cloudflare Workers rejecting `redirect: "error"` before
  Firebase account lookup and Google token requests. Both now use `manual`
  and reject redirect responses without forwarding identity or credentials.
  Synthetic edge requests and worker tests verified the transport behavior;
  authenticated acceptance is recorded above; the remaining cases below are separate.

1. Run `npm test`, `npm run test:drive-worker`, both frontend build variants,
   and a Wrangler dry-run. Keep tests and real credentials separate.
2. Test OAuth with an isolated, authorized account and disposable Drive file:
   connect, upload/read back, open another tab, restore, expire and reconnect,
   revoke the stored grant, and verify a different Firebase user cannot access
   it. Verify a shared file's `driveFile` and resource key survive the flow.
3. Check revoked/disabled Firebase users and Firebase/Google outages fail
   closed without replacing or deleting active canvas content. Confirm the
   user sees an actionable recovery message.
4. Google may rotate a refresh token. If the provider rotates it immediately
   before the Durable Object process terminates and before durable storage
   completes, reauthorization may be required. Do not promise uninterrupted
   reconnection. The current canvas and Drive file must remain intact.
5. Removing the stored grant deletes this service's encrypted copy; it does not
   revoke the Google account's app authorization or invalidate already-issued
   short-lived access tokens. The UI must distinguish these actions.
6. Deploy only the reviewed release; check the public app version and perform
   actual authenticated Drive read/write and new-tab checks before describing
   it as accepted. If verification fails, turn off the frontend flag and use
   the documented gateway rollback without deleting user files or grants.
