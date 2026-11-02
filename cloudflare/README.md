# Infinite Studio domain gateway (draft)

This draft serves the existing static application at a second hostname while
keeping `moodboard.petfashion.tw` available for existing links and local data.
Run `node --test cloudflare-gateway.test.mjs` to check the proxy behavior.

On 2026-11-02 the gateway was deployed to `infinite.petfashion.tw` using
Worker `infinite-studio-gateway`. The old hostname remains active. Firebase
Authentication and the Drive Picker browser key allow the new hostname.
An anonymous shared-file view and the application shell were checked on the
new hostname; real sign-in and Drive editing and saving remain to be verified.

Browser storage belongs to each origin. Existing browser-local work does not
automatically transfer to the new hostname; use the old site and export/import
or Drive as appropriate. Do not redirect the existing hostname until a safe
migration path has been verified.
