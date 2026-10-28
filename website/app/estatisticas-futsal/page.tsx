import type { Metadata } from "next";
import { ArticlePage } from "../guias/ArticlePage";

const title = "App de estatísticas de futsal para treinadores: o que medir e como";
const lead = "O Futsal SubStats é uma app de estatísticas de futsal feita para o banco: durante o jogo regista substituições, golos, assistências, faltas, cartões e perdas de bola em poucos toques; depois mostra painéis por equipa e por jogador ao longo da época. Funciona no iPhone, iPad, Android e no browser, mesmo sem internet.";

export const metadata: Metadata = {
  title,
  description: lead,
  alternates: { canonical: "/estatisticas-futsal" },
  openGraph: { title, description: lead, url: "/estatisticas-futsal" },
};

export default function Estatisticas() {
  return <ArticlePage
    path="/estatisticas-futsal"
    title={title}
    lead={lead}
    sections={[
      { heading: "Que estatísticas interessam num jogo de futsal", list: [
        "Tempo de jogo: minutos, entradas, tempo médio por entrada e tempo de banco de cada jogador.",
        "Ações ofensivas: golos, assistências e minuto de cada golo.",
        "Participação: em quantos golos marcados e sofridos cada jogador estava em campo (saldo +/−).",
        "Disciplina: faltas, faltas acumuladas da equipa, cartões amarelos e vermelhos.",
        "Perdas de bola, para perceber onde a equipa entrega a posse.",
        "Situações especiais: tempo em inferioridade numérica e tempo em 5x4 com guarda-redes avançado.",
      ] },
      { heading: "Durante o jogo", paragraphs: [
        "A app foi desenhada para ser usada por quem está no banco, sem perder o jogo de vista: cada substituição é um toque no jogador em campo e outro no jogador do banco, e cada ação fica registada no minuto certo. Se um lance for corrigido mais tarde, os totais atualizam sozinhos.",
      ] },
      { heading: "Depois do jogo e ao longo da época", list: [
        "Painel da equipa com minutos, resultados, forma, golos por período e disciplina.",
        "Painel do jogador com utilização, impacto e últimos jogos, e filtro por jogo.",
        "Exportação para Excel/CSV e PDF pronto a partilhar com a direção, a equipa técnica ou os atletas.",
        "Na licença Clube, visão de conjunto de vários escalões, da formação aos seniores.",
      ] },
      { heading: "Para quem é", paragraphs: [
        "Treinadores e treinadores-adjuntos de futsal (e fútbol sala) de qualquer escalão, coordenadores técnicos e clubes que querem dados objetivos sobre o tempo de jogo e o rendimento dos atletas sem depender de folhas soltas. Está em português, espanhol e inglês.",
      ] },
    ]}
    faq={[
      { question: "Existe uma app de estatísticas específica para futsal?", answer: "Sim. O Futsal SubStats é feito de raiz para futsal: substituições volantes, tempo parado, faltas acumuladas, expulsões com tempo de castigo e guarda-redes avançado (5x4)." },
      { question: "Posso importar o plantel do Excel?", answer: "Sim. A app importa um ficheiro CSV com número, nome, posição e pé preferido." },
      { question: "Os dados ficam seguros?", answer: "Os dados não são vendidos nem partilhados, ficam alojados na União Europeia, e a app tem uma opção para transferir uma cópia de tudo ou apagar a conta." },
    ]}
  />;
}
