import type { Metadata } from "next";
import { ArticlePage, CONTACT_EMAIL } from "../guias/ArticlePage";

const title = "Preços do Futsal SubStats: licenças por época para treinadores e clubes";
const lead = "O Futsal SubStats vende licenças por época desportiva: Treinador por 35€, Personalizado de Treinador por 60€, Clube por 89,99€ (em vez de 129€) e Personalizado por 209,99€ (em vez de 299€). A todos os valores acresce IVA, e o primeiro mês é gratuito em qualquer licença.";

export const metadata: Metadata = {
  title,
  description: lead,
  alternates: { canonical: "/precos" },
  openGraph: { title, description: lead, url: "/precos" },
};

const plans = [
  { name: "Treinador", price: "35€", old: "", who: "Um treinador e um escalão", items: ["Uma conta de treinador", "Um escalão", "Todas as competições", "Estatísticas da equipa e dos atletas"] },
  { name: "Personalizado de Treinador", price: "60€", old: "", who: "Um treinador que quer estatísticas à medida", items: ["Tudo o que está na licença Treinador", "Estatísticas personalizadas", "Acompanhamento individual ao longo da época"] },
  { name: "Clube", price: "89,99€", old: "129€", who: "Clubes com vários escalões", items: ["Até cinco escalões", "Vários treinadores, cada um com o seu acesso", "Todas as competições", "Estatísticas por equipa, atleta e clube"] },
  { name: "Personalizado", price: "209,99€", old: "299€", who: "Clubes que querem ir mais longe", items: ["Tudo o que está na licença Clube", "Estatísticas personalizadas", "Acompanhamento individual ao longo da época", "Apresentação das estatísticas e dashboards personalizados"] },
];

export default function Precos() {
  return <ArticlePage
    path="/precos"
    title={title}
    lead={lead}
    sections={[
      { heading: "Como funcionam as licenças", paragraphs: [
        "Cada licença é válida por uma época desportiva. Não há mensalidades nem publicidade. O primeiro mês é gratuito e, para ver a app antes disso, há uma partida de demonstração com uma equipa fictícia, sem conta.",
        "As licenças Clube e Personalizado estão neste momento com desconto: o Clube passou de 129€ para 89,99€ e o Personalizado de 299€ para 209,99€. Os preços não incluem IVA.",
      ] },
    ]}
    faq={[
      { question: "Quanto custa o Futsal SubStats?", answer: "A licença Treinador custa 35€ por época, o Personalizado de Treinador 60€, a licença Clube 89,99€ (com desconto, antes 129€) e a Personalizado 209,99€ (com desconto, antes 299€). Acresce IVA. O primeiro mês é gratuito." },
      { question: "Qual é a diferença entre a licença Treinador e a licença Clube?", answer: "A licença Treinador é para uma pessoa e um escalão. A licença Clube cobre até cinco escalões, com vários treinadores, cada um com o seu acesso, e dá ao clube uma visão de conjunto das estatísticas da formação aos seniores." },
      { question: "O que inclui o plano Personalizado?", answer: "Estatísticas personalizadas à medida do que o treinador ou o clube quer acompanhar, e um acompanhamento individual ao longo da época. Existe para um treinador (60€) e para um clube (209,99€, que inclui tudo o que está na licença Clube)." },
      { question: "Há período experimental?", answer: "Sim. O primeiro mês é sem custos em qualquer licença, e a demo do site permite fazer uma partida completa sem criar conta." },
      { question: "Como se paga?", answer: `No site, por cartão, através do Stripe. Os planos personalizados combinam-se por email (${CONTACT_EMAIL}).` },
    ]}
  >
    <section>
      <h2>Licenças e preços (por época, + IVA)</h2>
      <div className="guide-table-wrap"><table className="guide-table">
        <thead><tr><th>Licença</th><th>Preço</th><th>Para quem</th><th>Inclui</th></tr></thead>
        <tbody>{plans.map((plan) => <tr key={plan.name}>
          <td><b>{plan.name}</b></td>
          <td className="guide-price">{plan.old && <><del>{plan.old}</del> </>}<b>{plan.price}</b>{plan.old && <small>com desconto</small>}</td>
          <td>{plan.who}</td>
          <td><ul>{plan.items.map((item) => <li key={item}>{item}</li>)}</ul></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </ArticlePage>;
}
