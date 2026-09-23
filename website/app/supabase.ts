// app/supabase.ts — cliente Supabase para o login embutido no site.
//
// O site vive num domínio diferente da app (site: futsalsubstats.r4m.workers.dev,
// app: futsalsubstats.vercel.app), por isso NÃO partilha sessão com ela — é uma
// segunda sessão, guardada só neste domínio, com a sua própria chave de
// armazenamento (`storageKey`) para nunca colidir com a da app (`futsal.auth`).
//
// A "publishable key" (o nome novo para o que era a "anon key") é feita para
// viver no browser — está protegida pelas políticas de RLS do lado do
// Supabase, não é segredo. Por isso pode ir aqui, fixa no código, tal como o
// `APP_URL` já vai em `page.tsx`: nada disto depende de variáveis de ambiente
// chegarem (ou não) ao bundle do cliente neste projeto (vinext + Cloudflare).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bkfkpfhcysuyiotwkaty.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_AmEgaOfCsF7NJPGJTqvHnw_IHPYlR_Y";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: "pkce",
      detectSessionInUrl: false,
      storageKey: "futsal-site.auth",
    },
  });
  return client;
}
