import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { isExternalIdentityTarget } from "../../shared/externalAuth";
import { sdk } from "./sdk";
import { supabaseAuth } from "./supabaseAuth";

export type TrpcContext = { req: CreateExpressContextOptions["req"]; res: CreateExpressContextOptions["res"]; user: User | null };

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const user = isExternalIdentityTarget(process.env)
    ? await supabaseAuth.authenticateRequest(opts.req)
    : await sdk.authenticateRequest(opts.req);
  return { req: opts.req, res: opts.res, user };
}
