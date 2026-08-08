'use client';

// A política de privacidade.
//
// Fica dentro da app, e não num documento à parte, por duas razões: a Apple pede
// um endereço público que esteja sempre a funcionar, e quem está a decidir se
// cria conta deve poder lê-la sem sair daqui.
//
// Não usa `Pagina` de propósito: tem de abrir sem sessão iniciada — é o endereço
// que vai no formulário da App Store, e quem revê não tem conta.

import { useRouter } from 'next/navigation';
import PageHead from '@/components/PageHead.jsx';
import { rotas } from '@/lib/routes.js';

const ATUALIZADA = '8 de agosto de 2026';
const CONTACTO = 'stef@junitec.pt';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <>
      <PageHead
        title="Política de privacidade"
        subtitle={`Futsal ao Vivo · atualizada a ${ATUALIZADA}`}
        actions={
          <button className="btn btn--ghost" onClick={() => router.back()}>
            Voltar
          </button>
        }
      />

      <div className="card prose">
        <p>
          Esta app serve para acompanhar jogos de futsal: quem entra, quem sai, quanto tempo cada
          jogador esteve em campo. Recolhe o mínimo que precisa para isso funcionar, e nada mais.
        </p>

        <h2 className="section">O que é guardado</h2>
        <p>
          <strong>A tua conta.</strong> O email e a palavra-passe com que entras. A palavra-passe
          nunca é guardada em texto — fica cifrada no serviço de autenticação, e ninguém, incluindo
          quem faz a app, lhe consegue chegar.
        </p>
        <p>
          <strong>O que escreves na app.</strong> Os clubes, os escalões, as competições, os nomes e
          números dos jogadores, os jogos e tudo o que se passa dentro deles: golos, substituições,
          faltas, cartões, tempos. É isto que a app existe para guardar.
        </p>
        <p className="muted">
          Não há recolha de localização, de contactos, de fotografias, do microfone, nem de nada que
          o teu aparelho tenha e a app não precise. Não há publicidade, nem rastreio, nem
          identificadores para fins publicitários.
        </p>

        <h2 className="section">Onde fica</h2>
        <p>
          Primeiro no teu aparelho, sempre — é o que permite apontar um jogo inteiro num pavilhão
          sem rede. Depois, quando houver ligação, é enviado para um servidor Supabase alojado na
          União Europeia, para poderes abrir os mesmos dados noutro dispositivo.
        </p>

        <h2 className="section">Quem lhes toca</h2>
        <p>
          Só tu. O acesso é verificado no próprio servidor de base de dados: cada linha está ligada à
          conta que a criou, e um pedido feito com outra conta não a devolve. Os dados não são
          vendidos, partilhados, nem usados para outra coisa que não seja mostrar-tos de volta.
        </p>
        <p className="muted">
          Há dois fornecedores envolvidos, e só porque a app não funciona sem eles: o{' '}
          <strong>Supabase</strong>, que guarda os dados e trata do início de sessão, e a{' '}
          <strong>Vercel</strong>, que serve a app. Nenhum deles usa nada disto para fins próprios.
        </p>

        <h2 className="section">Durante quanto tempo</h2>
        <p>
          Enquanto quiseres. Não há apagamento automático — um histórico de épocas anteriores só tem
          valor se lá continuar.
        </p>

        <h2 className="section">Apagar tudo</h2>
        <p>
          Na página <strong>A minha conta</strong> há um botão que apaga a conta e, com ela, todos os
          clubes, planteis, jogos e o histórico de cada um, no aparelho e no servidor. É imediato e
          não é preciso pedir a ninguém. Antes disso podes transferir uma cópia de tudo, num
          ficheiro que fica contigo.
        </p>

        <h2 className="section">Os teus direitos</h2>
        <p>
          Pelo RGPD podes pedir uma cópia dos teus dados, corrigi-los, apagá-los ou opor-te ao
          tratamento. A cópia e a eliminação estão à distância de um botão na app; para o resto,
          escreve para <strong>{CONTACTO}</strong>.
        </p>

        <h2 className="section">Crianças</h2>
        <p>
          A app é para treinadores. Os nomes e números de camisola de jogadores — que podem ser
          menores — são escritos por quem treina, e é dessa pessoa a responsabilidade de ter
          autorização para os registar. Guarda-se apenas o nome, o número, a posição e o pé
          preferido: o suficiente para uma ficha de jogo, e nada que identifique alguém fora dela.
        </p>

        <h2 className="section">Alterações</h2>
        <p>
          Se isto mudar, a data no topo muda com ele. Alterações que afetem o que é recolhido serão
          avisadas dentro da app.
        </p>

        <h2 className="section">Contacto</h2>
        <p>
          Qualquer dúvida ou pedido: <strong>{CONTACTO}</strong>.
        </p>
      </div>

      <div className="page__actions">
        <button className="btn btn--ghost" onClick={() => router.push(rotas.login())}>
          Ir para o início de sessão
        </button>
      </div>
    </>
  );
}
