import type { Metadata } from "next";
import { ArticlePage } from "../../guias/ArticlePage";

const title = "Futsal SubStats: app de estadísticas y minutos para entrenadores de fútbol sala";
const lead = "Futsal SubStats es una app para entrenadores de fútbol sala (futsal) que registra cambios, goles, asistencias, faltas, tarjetas y pérdidas de balón en pocos toques, y cuenta los minutos de cada jugador con tiempo parado o corrido. Funciona sin conexión en el pabellón y está disponible en iPhone, iPad, Android y navegador, en español, portugués e inglés.";

export const metadata: Metadata = {
  title,
  description: lead,
  alternates: { canonical: "/es/app-futbol-sala" },
  openGraph: { title, description: lead, url: "/es/app-futbol-sala", locale: "es_ES" },
};

export default function AppFutbolSala() {
  return <ArticlePage
    lang="es"
    path="/es/app-futbol-sala"
    title={title}
    lead={lead}
    sections={[
      { heading: "Durante el partido", list: [
        "Cambios con un toque: el jugador en pista y el del banquillo (o arrastrando uno sobre otro).",
        "Cronómetro de futsal: tiempo parado o corrido, por parte y por categoría.",
        "Goles, faltas, tarjetas y pérdidas de balón en el minuto exacto.",
        "Expulsiones con el tiempo de sanción controlado y portero-jugador (5x4) separado.",
        "Sin conexión: el partido se guarda en el dispositivo y se sincroniza después.",
      ] },
      { heading: "Después del partido", list: [
        "Minutos, entradas, tiempo medio y tiempo de banquillo de cada jugador.",
        "Goles, asistencias y participación en goles a favor y en contra (+/−).",
        "Paneles de equipo y de jugador a lo largo de la temporada.",
        "Exportación a Excel/CSV y PDF para compartir con el cuerpo técnico, la directiva o los jugadores.",
      ] },
      { heading: "Precios (por temporada, + IVA)", list: [
        "Entrenador: 35€ — un entrenador y un equipo.",
        "Personalizado de Entrenador: 60€ — estadísticas a medida y acompañamiento individual.",
        "Club: 89,99€ con descuento (antes 129€) — hasta cinco equipos, cada entrenador con su acceso.",
        "Personalizado: 209,99€ con descuento (antes 299€) — estadísticas y dashboards a medida para el club.",
        "El primer mes es gratis en cualquier licencia.",
      ] },
    ]}
    faq={[
      { question: "¿Futsal SubStats está en Google Play (Android)?", answer: "Sí. Está en Google Play Store para Android desde octubre de 2026, en App Store para iPhone e iPad y en el navegador." },
      { question: "¿Cuál es la mejor app para contar los minutos en fútbol sala?", answer: "Futsal SubStats está pensada exactamente para eso: registra cada cambio con un toque, cuenta el tiempo de cada jugador con tiempo parado o corrido y funciona sin conexión." },
      { question: "¿Está en español?", answer: "Sí. La app y la web están en español, portugués e inglés." },
      { question: "¿Cuánto cuesta?", answer: "Desde 35€ por temporada (+ IVA) para un entrenador. La licencia Club cuesta 89,99€ (con descuento, antes 129€). El primer mes es gratis." },
    ]}
  />;
}
