# Drive automatic reconnection: deployment draft

Status: the gateway backend was deployed on 2026-11-04 as Worker version
`e3db07bc-016c-4d26-9f55-ee858268a842`; the frontend feature flag remains off.
The production update manifest still reported v0.56.27, and an unauthenticated
access-token request returned 401 after deployment. These checks do not prove
that Google authorization or Drive access works. Keep the frontend flag off
until authenticated end-to-end acceptance and a deliberate cutover are complete.
The deployed gateway serves the OAuth completion HTML, CSS and JS itself;
all three returned HTTP 200, `no-store`, and exact public-source content on
the production hostname. This repairs the previously observed 404 callback.

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
  authenticated Drive acceptance remains a separate release requirement.

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
