// supabase/functions/atualizacao/index.ts
//
// O endereço que responde à pergunta "há versão nova?".
//
// O plugin do telemóvel faz um POST com o que tem instalado; esta função olha
// para a tabela `app_bundles` e responde uma de duas coisas:
//
//   { version, url, checksum }   → descarrega isto
//   { message: "..." }           → não há nada para ti
//
// Publicar em:
//   supabase functions deploy atualizacao --no-verify-jwt
//
// O `--no-verify-jwt` é obrigatório e vale a pena perceber porquê: o plugin
// pergunta **antes** de a app abrir, sem sessão iniciada e sem saber quem é o
// utilizador. Uma função que exigisse autenticação nunca chegaria a ser
// chamada. Não é um buraco: esta função só devolve o endereço de um pacote que
// já é público, e não aceita escritas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** O que o plugin envia. Só usamos quatro campos; o resto é diagnóstico. */
interface Pedido {
  version_name?: string; // a versão web instalada agora
  version_build?: string; // a versão nativa (a da loja)
  platform?: string; // 'ios' | 'android'
  device_id?: string;
  app_id?: string;
  plugin_version?: string;
}

/**
 * Compara duas versões semver. Devolve >0 se `a` for mais recente.
 *
 * Escrito à mão porque é meia dúzia de linhas e evita uma dependência num sítio
 * onde uma dependência a mais é mais risco do que benefício.
 */
function compara(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/**
 * Um número de 0 a 99 estável para cada aparelho.
 *
 * O lançamento faseado tem de ser **determinístico**: o mesmo telemóvel tem de
 * cair sempre do mesmo lado. Com `Math.random()`, um aparelho recebia a
 * atualização numa verificação e deixava de a receber na seguinte, ficando a
 * saltar entre versões.
 */
function balde(deviceId: string): number {
  let h = 0;
  for (let i = 0; i < deviceId.length; i++) {
    h = (h * 31 + deviceId.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

/**
 * "Não há nada para ti", com o motivo.
 *
 * O `detalhe` existe porque a primeira versão desta função dizia só "erro a
 * consultar os pacotes" e engolia a causa — que era exactamente o que era
 * preciso saber para a arranjar. Um diagnóstico que esconde o diagnóstico não
 * serve de nada.
 *
 * O protocolo do plugin já prevê um campo `error` opcional, e o que aqui se
 * revela é sobre uma tabela que não tem dados de ninguém.
 */
const semNovidade = (motivo: string, detalhe?: string) =>
  new Response(JSON.stringify({ message: motivo, ...(detalhe ? { error: detalhe } : {}) }), {
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return semNovidade('Só POST.');

  let corpo: Pedido = {};
  try {
    corpo = await req.json();
  } catch {
    return semNovidade('Pedido ilegível.');
  }

  const { version_name = '', version_build = '', platform = '', device_id = '' } = corpo;
  if (!version_name || !platform) return semNovidade('Faltam dados no pedido.');

  const supaUrl = Deno.env.get('SUPABASE_URL');
  // A chave de serviço nunca sai daqui. É o que permite ler uma tabela que está
  // fechada a toda a gente.
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !supaKey) {
    return semNovidade(
      'Erro a consultar os pacotes.',
      `faltam variáveis no ambiente da função: ${!supaUrl ? 'SUPABASE_URL ' : ''}${
        !supaKey ? 'SUPABASE_SERVICE_ROLE_KEY' : ''
      }`.trim()
    );
  }

  const sb = createClient(supaUrl, supaKey);

  const { data, error } = await sb
    .from('app_bundles')
    .select('versao, url, checksum, minima_nativa, percentagem')
    .eq('ativo', true)
    .or(`plataforma.eq.${platform},plataforma.is.null`)
    .order('criado_em', { ascending: false })
    .limit(20);

  if (error) return semNovidade('Erro a consultar os pacotes.', error.message);
  if (!data?.length) return semNovidade('Não há pacotes publicados.');

  // O mais recente por número de versão, não por data de inserção: reativar um
  // pacote antigo depois de travar um mau não pode fazer a app "atualizar" para
  // trás sem se querer.
  const candidatos = data
    .filter((b) => compara(b.versao, version_name) > 0)
    .sort((a, b) => compara(b.versao, a.versao));

  for (const b of candidatos) {
    // A casca nativa é velha de mais para este pacote? Salta-o e tenta o
    // seguinte — pode haver um mais antigo que este telemóvel ainda aceita.
    if (b.minima_nativa && version_build && compara(version_build, b.minima_nativa) < 0) {
      continue;
    }
    // Lançamento faseado.
    if (b.percentagem < 100 && device_id && balde(device_id) >= b.percentagem) {
      continue;
    }
    return new Response(
      JSON.stringify({ version: b.versao, url: b.url, checksum: b.checksum }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  return semNovidade('Já tens a versão mais recente que te serve.');
});
