// Supabase Edge Function entry point. All logic lives in handler.js so it can be tested in Node.
import { handle } from "./handler.js";

Deno.serve((req: Request) => handle(req, Deno.env.toObject()));
