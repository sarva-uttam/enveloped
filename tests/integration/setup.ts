import { getLocalSupabaseEnv } from "./helpers/local-env";

// Runs once, before any integration test file, and BEFORE any of them
// gets a chance to create a client or write a row. getLocalSupabaseEnv()
// throws immediately if the local stack isn't running or if anything
// about its resolved URLs isn't loopback-only — see helpers/local-env.ts
// for the full safety reasoning. Failing here, loudly and uniformly,
// beats each test file discovering the same problem independently deep
// into a beforeAll hook.
getLocalSupabaseEnv();
