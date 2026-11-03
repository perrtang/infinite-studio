// Draft entry point. Deploy only after secret setup and real OAuth acceptance.
import { DurableObject } from "cloudflare:workers";
import { handleRequest } from "./infinite-studio-gateway.js";
import { readDriveWorkerConfig } from "./drive-worker-config.js";
import { createDriveActor, createDriveActorBridge, createDriveActorEndpoint } from "./drive-actor-bridge.js";
import { createDriveAuthRouter } from "./drive-auth-router.js";
import { createDriveIdentityVerifier } from "./drive-identity.js";
import { createFirebaseAccountCheck } from "./firebase-account-check.js";

function identityFor(config) { return createDriveIdentityVerifier({ firebaseProjectId: "pet-fashion-tw", googleClientId: config.clientId, checkFirebaseAccount: createFirebaseAccountCheck({ apiKey: config.firebaseApiKey }) }); }

export class DriveGrant extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const uid = ctx.id.name;
    const config = readDriveWorkerConfig(env);
    this.endpoint = createDriveActorEndpoint(createDriveActor({ ...config, uid, storage: ctx.storage, identity: identityFor(config) }));
  }
  begin(token) { return this.endpoint.begin(token); }
  callback(args) { return this.endpoint.callback(args); }
  complete(args) { return this.endpoint.complete(args); }
  refresh() { return this.endpoint.refresh(); }
  revoke() { return this.endpoint.revoke(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/drive/")) return handleRequest(request);
    try {
      const config = readDriveWorkerConfig(env);
      if (!env.DRIVE_GRANTS?.getByName) throw new Error("Drive binding missing");
      const identity = identityFor(config);
      const bridge = createDriveActorBridge({ identity, stateKey: config.stateKey, actorForUid: uid => env.DRIVE_GRANTS.getByName(uid) });
      return await createDriveAuthRouter({ identity, ...bridge })(request);
    } catch {
      return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
  },
};
