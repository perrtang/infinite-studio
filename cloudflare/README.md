# Infinite Studio domain gateway (draft)

This draft serves the existing static application at a second hostname while
keeping `moodboard.petfashion.tw` available for existing links and local data.
Run `node --test cloudflare-gateway.test.mjs` to check the proxy behavior.

The gateway is not deployed. Before connecting the new hostname, verify the
worker, DNS and TLS, Firebase authorized domains, Google API restrictions,
and real sign-in and Drive flows. Browser storage belongs to each origin;
provide a verified recovery or migration path before directing existing users
to the new hostname. Do not redirect the existing hostname in the meantime.
