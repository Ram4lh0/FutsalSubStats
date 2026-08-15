'use client';

// app/password/page.jsx — definir ou mudar a palavra-passe.
//
// Um ecrã, dois caminhos que chegam aqui:
//
//   1. **Do email.** Um convite ou uma recuperação trazem `?th=…&tipo=…` no
//      endereço. A página troca esse símbolo por uma sessão e pede uma
//      palavra-passe nova. Não há palavra-passe antiga para pedir — no convite
//      nunca houve nenhuma, e na recuperação a pessoa está aqui precisamente
//      por não se lembrar dela.
//
//   2. **De dentro da app**, pelas Definições. Aí há sessão e há palavra-passe,
//      e a atual é pedida antes de deixar mudar seja o que for.
//
// ## Porque é que não está atrás do `Guard`
//
// Quem chega pelo convite ainda não tem sessão — é esta página que lha vai dar.
// Com o `Guard` à frente, seria atirado para a entrada antes de a página chegar
// a ler o símbolo, e o convite não servia para nada. O `<Suspense>` fica na
// mesma, porque `useSearchParams` obriga.
//
// A página sem sessão e sem símbolo não faz nada de útil e diz isso mesmo.
//
// ## Porque é que a palavra-passe atual é pedida
//
// O `updateUser` do Supabase não a pede: basta ter sessão. E a sessão vive meses
// dentro do telemóvel. Sem esta confirmação, um aparelho destrancado esquecido
// em cima de um banco era uma conta perdida.
//
// ## O código de seis dígitos
//
// Quando o link falha, esta página não fica num beco: oferece o código que vem
// no mesmo email. Os links só servem uma vez e há quem os gaste sem querer —
// os filtros de segurança de algumas empresas abrem as ligações das mensagens
// antes de as entregar, para as verificar, e quando a pessoa carrega o link já
// foi usado. O código não se gasta a ser lido.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHead from '@/components/PageHead.jsx';
import { Field } from '@/components/bits.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

/**
 * O mínimo que esta app aceita.
 *
 * O Supabase, por omissão, aceita 6. Aqui pede-se mais — a app guarda uma época
 * inteira de trabalho e não custa nada a quem escolhe. Pedir **menos** do que o
 * servidor é que seria um erro: a recusa vinha do lado de lá, em inglês.
 */
const MINIMO = 8;

/** Os tipos de link que esta página sabe receber. Nada mais entra. */
const TIPOS = ['invite', 'recovery'];

export default function PasswordPage() {
  return (
    <Suspense fallback={<p className="muted" style={{ padding: 20 }}>…</p>}>
      <PalavraPasse />
    </Suspense>
  );
}

function PalavraPasse() {
  const router = useRouter();
  const t = useT();
  const { toast } = useUI();
  const {
    ready,
    remote,
    session,
    user,
    trocarLinkPorSessao,
    trocarCodigoPorSessao,
    confirmarPalavraPasse,
    definirPalavraPasse,
    pedirRecuperacao,
  } = useAuth();

  const params = useSearchParams();
  const tokenHash = params.get('th') || '';
  const tipoBruto = params.get('tipo') || '';
  const tipo = TIPOS.includes(tipoBruto) ? tipoBruto : '';

  // 'link' enquanto o símbolo do email está a ser trocado por sessão;
  // 'codigo' quando isso falhou e resta o código; 'forma' quando há sessão.
  const [fase, setFase] = useState(tokenHash && tipo ? 'link' : 'forma');
  const [emailCodigo, setEmailCodigo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [aConfirmar, setAConfirmar] = useState(false);

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [aVer, setAVer] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [aRecuperar, setARecuperar] = useState(false);

  // Veio do email? Então é para definir, e não se pede nada do que havia antes.
  const definir = Boolean(tipo);

  /* -------------------------------------------------- trocar o link por sessão */

  useEffect(() => {
    if (fase !== 'link' || !ready) return;
    let vivo = true;
    (async () => {
      const { error } = await trocarLinkPorSessao(tokenHash, tipo);
      if (!vivo) return;
      // Sem drama e sem toast: o ecrã do código explica-se a si próprio, e um
      // aviso vermelho a dizer "expirou" logo à entrada só assusta.
      setFase(error ? 'codigo' : 'forma');
    })();
    return () => {
      vivo = false;
    };
    // Corre uma vez, quando a sessão do Supabase acabar de arrancar. O símbolo
    // do endereço não muda, e voltar a trocá-lo daria erro: já foi gasto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ------------------------------------------------------- o código do email */

  async function usarCodigo(e) {
    e.preventDefault();
    if (!emailCodigo.trim() || !codigo.trim()) return toast(t('pass.faltaCodigo'), 'error');
    setAConfirmar(true);
    const { error } = await trocarCodigoPorSessao(emailCodigo, codigo, tipo || 'recovery');
    setAConfirmar(false);
    if (error) return toast(error, 'error');
    setFase('forma');
  }

  /* ------------------------------------------------ não sei a atual */

  /**
   * A saída para quem tem sessão e não tem palavra-passe.
   *
   * Isto faltava, e o buraco era este: a página decidia se pedia a palavra-passe
   * atual olhando **só** para o endereço. Quem entrasse por um link mágico — ou
   * aceitasse um convite e fosse parar à app sem passar por aqui — ficava com
   * sessão iniciada, sem palavra-passe nenhuma, e a ver um formulário que lhe
   * exigia uma que nunca existiu. Sem saída, dentro da própria conta.
   *
   * A tentação é deixar mudar sem pedir nada, já que a sessão prova quem é. Não
   * chega: a sessão dura meses dentro do telemóvel, e quem apanhasse o aparelho
   * destrancado ficava com a conta. O email volta a provar que é mesmo a pessoa,
   * e é o mesmo caminho que já existia na entrada — só que aqui não obriga a
   * sair primeiro para o encontrar.
   */
  async function naoSeiAAtual() {
    if (aRecuperar) return;
    setARecuperar(true);
    const { error } = await pedirRecuperacao(user?.email || '');
    setARecuperar(false);
    if (error) return toast(error, 'error');
    toast(t('pass.naoSeiEnviado', { email: user?.email || '' }), 'ok', 9000);
  }

  /* ------------------------------------------------------------- guardar */

  async function guardar(e) {
    e.preventDefault();
    if (aGuardar) return;

    if (nova.length < MINIMO) return toast(t('pass.curta', { n: MINIMO }), 'error');
    if (nova !== repetida) return toast(t('pass.naoCoincide'), 'error');
    if (!definir && !atual) return toast(t('pass.faltaAtual'), 'error');

    setAGuardar(true);
    try {
      // A ordem importa: confirmar primeiro, escrever depois. Ao contrário, uma
      // palavra-passe errada só era detectada com a nova já gravada.
      if (!definir) {
        const { error } = await confirmarPalavraPasse(user?.email || '', atual);
        if (error) return toast(t('pass.atualErrada'), 'error');
      }
      const { error } = await definirPalavraPasse(nova);
      if (error) return toast(error, 'error');

      toast(definir ? t('pass.definida') : t('pass.guardada'), 'ok', 6000);
      router.replace(definir ? rotas.dashboard() : rotas.conta());
    } finally {
      setAGuardar(false);
    }
  }

  /* ------------------------------------------------------------------ ecrãs */

  if (fase === 'link' || !ready) {
    return (
      <div className="auth">
        <div className="auth__card card">
          <p className="muted">{t('pass.aValidar')}</p>
        </div>
      </div>
    );
  }

  if (fase === 'codigo') {
    return (
      <div className="auth">
        <form className="auth__card card" onSubmit={usarCodigo}>
          <h1 className="page__title">{t('pass.linkGasto')}</h1>
          <p className="page__sub">{t('pass.linkGastoTexto')}</p>

          <Field label={t('login.email')}>
            <input
              className="input"
              type="email"
              value={emailCodigo}
              onChange={(ev) => setEmailCodigo(ev.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </Field>

          <Field label={t('pass.codigo')} hint={t('pass.codigoDica')}>
            <input
              className="input mono"
              value={codigo}
              onChange={(ev) => setCodigo(ev.target.value.replace(/\D/g, '').slice(0, 6))}
              // Estes três juntos são o que faz o teclado do telemóvel abrir nos
              // números e o iOS oferecer o código que acabou de chegar por email.
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </Field>

          <div className="form__actions">
            <button className="btn btn--ghost" type="button" onClick={() => router.push(rotas.login())}>
              {t('pass.irParaEntrada')}
            </button>
            <button className="btn btn--primary" type="submit" disabled={aConfirmar}>
              {aConfirmar ? t('pass.aConfirmar') : t('comum.confirmar')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Sem sessão e sem símbolo: alguém escreveu este endereço à mão.
  if (remote && !session) {
    return (
      <div className="auth">
        <div className="auth__card card">
          <h1 className="page__title">{t('pass.titulo')}</h1>
          <p className="page__sub">{t('pass.semSessao')}</p>
          <button className="btn btn--primary btn--block" onClick={() => router.push(rotas.login())}>
            {t('pass.irParaEntrada')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={definir ? t('pass.definirTitulo') : t('pass.mudarTitulo')}
        subtitle={user?.email || ''}
        // Quem vem do convite não tem para onde voltar — não passou por lado
        // nenhum. Quem vem das Definições, tem.
        backTo={definir ? undefined : rotas.conta()}
      />

      <form className="card" onSubmit={guardar}>
        <p className="muted">{definir ? t('pass.definirTexto') : t('pass.mudarTexto')}</p>

        {definir ? null : (
          <>
            <Field label={t('pass.atual')}>
              <input
                className="input"
                type="password"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {/* Fica sempre à vista, não escondido atrás de uma tentativa
                falhada: quem nunca teve palavra-passe não tem sequer o que
                errar, e ficava a olhar para um campo impossível. */}
            <button
              className="btn btn--ghost btn--tiny"
              type="button"
              onClick={naoSeiAAtual}
              disabled={aRecuperar}
            >
              {aRecuperar ? t('login.esqueciAEnviar') : t('pass.naoSei')}
            </button>
          </>
        )}

        {/* Um só interruptor para os dois campos: escondida numa caixa e visível
            na outra, ninguém percebia porque é que "não coincidem". */}
        <Field label={t('pass.nova')} hint={t('pass.dica', { n: MINIMO })}>
          <input
            className="input"
            type={aVer ? 'text' : 'password'}
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <Field label={t('pass.repetir')}>
          <input
            className="input"
            type={aVer ? 'text' : 'password'}
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <div className="form__actions">
          <button className="btn btn--ghost" type="button" onClick={() => setAVer(!aVer)}>
            {aVer ? t('pass.esconder') : t('pass.mostrar')}
          </button>
          <span className="toolbar__spacer" />
          <button className="btn btn--primary" type="submit" disabled={aGuardar}>
            {aGuardar ? t('comum.aGuardar') : t('pass.guardar')}
          </button>
        </div>
      </form>
    </>
  );
}
