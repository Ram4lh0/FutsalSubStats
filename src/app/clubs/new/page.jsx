'use client';

// app/clubs/new/page.jsx — criar clube. O mesmo formulário serve para editar,
// através de /club/edit.
//
// Uma conta tem **um** clube. O botão que trazia aqui desapareceu do painel
// quando já existe um, mas esconder um botão não fecha uma porta: o endereço
// continua a poder ser escrito à mão, ou estar guardado nos favoritos de quem o
// usou antes desta regra existir.
//
// Por isso quem chega aqui com um clube já criado é levado para ele, sem aviso
// nem erro. Não fez nada de errado — foi a um sítio que deixou de fazer sentido.

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ClubForm from '@/components/ClubForm.jsx';
import Guard from '@/components/Guard.jsx';
import { clubs } from '@/lib/data/repository.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function NovoClube() {
  return (
    <Guard>
      <Suspense fallback={<AoCarregar />}>
        <SeAindaNaoTiver />
      </Suspense>
    </Guard>
  );
}

function AoCarregar() {
  const t = useT();
  return <p className="muted">{t('comum.aCarregar')}</p>;
}

function SeAindaNaoTiver() {
  const router = useRouter();
  const [estado, setEstado] = useState('a-ver');

  useEffect(() => {
    let vivo = true;
    clubs
      .list()
      .then((lista) => {
        if (!vivo) return;
        if (lista.length) {
          // `replace` e não `push`: o botão "atrás" não pode trazer a pessoa de
          // volta a um formulário que nunca vai deixar gravar.
          router.replace(rotas.clube(lista[0].id));
          return;
        }
        setEstado('livre');
      })
      .catch(() => setEstado('livre'));
    return () => {
      vivo = false;
    };
  }, [router]);

  if (estado !== 'livre') return <AoCarregar />;
  return <ClubForm />;
}
