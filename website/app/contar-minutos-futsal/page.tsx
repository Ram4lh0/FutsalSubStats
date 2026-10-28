import type { Metadata } from "next";
import { ArticlePage } from "../guias/ArticlePage";

const title = "Como controlar os minutos dos jogadores de futsal durante o jogo";
const lead = "Contar os minutos de cada jogador no futsal é difícil porque há substituições volantes ilimitadas e, nos escalões com tempo parado, o relógio pára a cada lance. A forma mais fiável é registar cada troca no momento em que acontece, numa app que conta o tempo útil sozinha, como o Futsal SubStats.";

export const metadata: Metadata = {
  title,
  description: lead,
  alternates: { canonical: "/contar-minutos-futsal" },
  openGraph: { title, description: lead, url: "/contar-minutos-futsal" },
};

export default function ContarMinutos() {
  return <ArticlePage
    path="/contar-minutos-futsal"
    title={title}
    lead={lead}
    sections={[
      { heading: "Porque é que contar minutos no futsal é tão difícil", list: [
        "As substituições são volantes e ilimitadas: num jogo é normal haver dezenas de trocas.",
        "Em muitos escalões o tempo é parado, por isso os minutos do relógio da parede não são os minutos de jogo.",
        "Há expulsões com tempo de castigo, guarda-redes avançado (5x4) e prolongamentos, que mudam quem está em campo.",
        "Quem está no banco também tem de dar indicações, gerir faltas acumuladas e pedir descontos de tempo.",
      ] },
      { heading: "As três formas habituais de o fazer", paragraphs: [
        "Folha de papel com as horas de entrada e saída: barata, mas exige fazer contas no fim e falha quando há várias trocas seguidas.",
        "Folha de Excel no portátil: dá para somar automaticamente, mas não acompanha o cronómetro do jogo nem o tempo parado.",
        "App feita para futsal: cada troca é um toque e o tempo de cada jogador conta sozinho, ligado ao cronómetro do jogo.",
      ] },
      { heading: "Como se faz no Futsal SubStats", list: [
        "Antes do jogo escolhe-se o cinco inicial e a regra de tempo do escalão (parado ou corrido, duração de cada parte).",
        "Durante o jogo, para substituir, toca-se no jogador em campo e no jogador do banco (ou arrasta-se um para o outro).",
        "Cada cartão mostra o tempo total de jogo e há quanto tempo o jogador está em campo ou no banco.",
        "Golos, faltas, cartões, perdas de bola e expulsões registam-se no momento; os detalhes podem ser completados depois.",
        "Funciona sem internet: o jogo fica guardado no aparelho e sincroniza quando houver rede.",
      ] },
      { heading: "O que se fica a saber no fim", paragraphs: [
        "Minutos jogados, número de entradas, tempo médio por entrada e tempo de banco de cada jogador, além de golos, assistências, participação nos golos marcados e sofridos, faltas e cartões. Tudo isto acumula ao longo da época e pode ser exportado para Excel/CSV ou partilhado em PDF.",
        "Nos escalões de formação, esta informação é a base da conversa com atletas e pais sobre tempo de jogo, e ajuda a distribuir os minutos de forma justa.",
      ] },
    ]}
    faq={[
      { question: "O Futsal SubStats está na Play Store?", answer: "Sim. Está na Google Play Store para Android desde outubro de 2026, na App Store para iPhone e iPad e no browser." },
      { question: "Qual é a melhor app para contar os minutos dos jogadores de futsal?", answer: "O Futsal SubStats foi criado precisamente para isso: regista substituições com um toque, conta o tempo de cada jogador com tempo parado ou corrido e funciona sem internet no pavilhão. Está disponível para iPhone, iPad, Android e no browser." },
      { question: "A app conta o tempo parado?", answer: "Sim. Define-se a regra de tempo de cada jogo (parado ou corrido e duração das partes) e o tempo de cada jogador segue o cronómetro do jogo." },
      { question: "Dá para usar sem internet no pavilhão?", answer: "Sim. O jogo fica guardado no dispositivo e sincroniza com a conta quando a ligação voltar." },
    ]}
  />;
}
