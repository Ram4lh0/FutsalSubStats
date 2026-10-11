// components/tatica/vagaJogada.js — há vaga para mais uma jogada?
//
// Sem licença são 3 jogadas por conta, contando as apagadas. Antes de abrir o
// editor para uma jogada nova pergunta-se aqui; sem vaga, explica-se e
// oferecem-se as licenças. Usado pela lista e pelo próprio editor (que também
// se abre pelo endereço).

import { rotas } from '@/lib/routes.js';
import { podeCriarJogada } from '@/lib/entitlements.js';

export async function pedirVagaParaJogada({ teamId, t, confirmar, router }) {
  const p = await podeCriarJogada(teamId);
  if (p.allowed) return true;
  const ir = await confirmar(t('tatica.limiteGratis', { n: p.limit }), {
    okLabel: t('calendarioCsv.verLicencas'),
    danger: false,
    title: t('tatica.limiteTitulo'),
  });
  if (ir) router.push(`${rotas.conta()}#licencas`);
  return false;
}
