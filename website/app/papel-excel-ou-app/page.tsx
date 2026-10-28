import type { Metadata } from "next";
import { ArticlePage } from "../guias/ArticlePage";

const title = "Papel, Excel ou app: qual a melhor forma de registar um jogo de futsal?";
const lead = "Para registar minutos e estatísticas num jogo de futsal, o papel é barato mas lento, o Excel soma sozinho mas não acompanha o jogo, e uma app específica como o Futsal SubStats regista cada troca e ação no momento e entrega as estatísticas prontas no fim.";

export const metadata: Metadata = {
  title,
  description: lead,
  alternates: { canonical: "/papel-excel-ou-app" },
  openGraph: { title, description: lead, url: "/papel-excel-ou-app" },
};

const rows = [
  ["Registar uma substituição", "Escrever nomes e hora", "Escrever numa célula", "Um toque (ou arrastar)"],
  ["Tempo parado", "Contas à mão", "Contas à mão", "Automático, segue o cronómetro"],
  ["Minutos por jogador no fim", "Somar tudo depois do jogo", "Fórmulas, se estiverem certas", "Imediato"],
  ["Golos, faltas, cartões", "Possível, mas confuso", "Possível, mas lento", "Um toque, no minuto certo"],
  ["Acumulado da época", "Passar tudo a limpo", "Copiar entre folhas", "Automático, com painéis"],
  ["Sem internet", "Sim", "Sim (no portátil)", "Sim, sincroniza depois"],
  ["Custo", "Grátis", "Grátis", "Desde 35€ por época, 1.º mês grátis"],
];

export default function Comparacao() {
  return <ArticlePage
    path="/papel-excel-ou-app"
    title={title}
    lead={lead}
    sections={[
      { heading: "Quando chega o papel", paragraphs: [
        "Num jogo com poucas trocas e sem necessidade de estatísticas acumuladas, uma folha de papel resolve. O problema aparece quando há muitas substituições seguidas, tempo parado ou quando é preciso juntar os dados de vários jogos.",
      ] },
      { heading: "Quando o Excel deixa de servir", paragraphs: [
        "O Excel é ótimo depois do jogo, mas durante o jogo obriga a escrever horas e nomes num portátil no banco. E não sabe quando o relógio está parado. Por isso o Futsal SubStats exporta para Excel/CSV: regista-se na app e analisa-se no Excel quem quiser.",
      ] },
      { heading: "O que muda com uma app feita para futsal", paragraphs: [
        "A app conhece as regras do futsal: substituições volantes, tempo parado por escalão, expulsões com tempo de castigo e guarda-redes avançado. Quem está no banco só toca nos jogadores; o resto é contado sozinho.",
      ] },
    ]}
  >
    <section>
      <h2>Comparação lado a lado</h2>
      <div className="guide-table-wrap"><table className="guide-table">
        <thead><tr><th></th><th>Papel</th><th>Excel</th><th>Futsal SubStats</th></tr></thead>
        <tbody>{rows.map(([label, ...cells]) => <tr key={label}><td><b>{label}</b></td>{cells.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  </ArticlePage>;
}
