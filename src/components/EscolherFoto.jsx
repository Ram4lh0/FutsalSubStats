'use client';

// components/EscolherFoto.jsx — escolher o emblema, nos formulários do clube e
// do escalão.
//
// Mostra o que está lá agora, deixa trocar e deixa tirar. O trabalho pesado —
// recortar, encolher, comprimir até caber — está em `lib/imagem.js`; aqui só se
// trata do que a pessoa vê enquanto isso acontece.
//
// Não há botão de "guardar foto" à parte: a imagem faz parte do formulário e
// grava-se com o resto. Um segundo botão levaria a metade das pessoas a mudar a
// foto, carregar em Guardar, e ficar sem perceber qual dos dois valeu.

import { useRef, useState } from 'react';
import Emblema from './Emblema.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useT } from '@/lib/i18n/index.js';
import { prepararEmblema, TIPOS } from '@/lib/imagem.js';

export default function EscolherFoto({ nome, cor, valor, onChange }) {
  const t = useT();
  const { toast } = useUI();
  const input = useRef(null);
  const [aTratar, setATratar] = useState(false);

  async function escolhida(evento) {
    const ficheiro = evento.target.files?.[0];
    // Limpa já: sem isto, escolher o mesmo ficheiro outra vez depois de o
    // remover não dispara nada, porque o valor do input não mudou.
    evento.target.value = '';
    if (!ficheiro) return;

    setATratar(true);
    try {
      onChange(await prepararEmblema(ficheiro));
    } catch (err) {
      toast(err.chave ? t(err.chave) : String(err.message), 'error');
    } finally {
      setATratar(false);
    }
  }

  return (
    <div className="field">
      <span className="field__label">{t('foto.titulo')}</span>
      <div className="form__actions form__actions--left" style={{ alignItems: 'center' }}>
        <Emblema nome={nome} foto={valor} cor={cor} tamanho={64} />
        <input
          ref={input}
          type="file"
          accept={TIPOS.join(',')}
          onChange={escolhida}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn--ghost"
          type="button"
          disabled={aTratar}
          onClick={() => input.current?.click()}
        >
          {aTratar ? t('foto.aTratar') : valor ? t('foto.trocar') : t('foto.escolher')}
        </button>
        {valor ? (
          <button className="btn btn--ghost btn--tiny" type="button" onClick={() => onChange(null)}>
            {t('foto.remover')}
          </button>
        ) : null}
      </div>
      <span className="field__hint">{t('foto.dica')}</span>
    </div>
  );
}
