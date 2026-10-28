import type { Metadata } from "next";
import { ArticlePage } from "../../guias/ArticlePage";

const title = "Futsal SubStats: futsal stats and playing-time app for coaches";
const lead = "Futsal SubStats is an app for futsal coaches that logs substitutions, goals, assists, fouls, cards and turnovers in a few taps and tracks every player's minutes with stopped or running clock. It works offline in the sports hall and runs on iPhone, iPad, Android and in the browser, in English, Portuguese and Spanish.";

export const metadata: Metadata = {
  title,
  description: lead,
  alternates: { canonical: "/en/futsal-stats-app" },
  openGraph: { title, description: lead, url: "/en/futsal-stats-app", locale: "en_GB" },
};

export default function FutsalStatsApp() {
  return <ArticlePage
    lang="en"
    path="/en/futsal-stats-app"
    title={title}
    lead={lead}
    sections={[
      { heading: "During the match", list: [
        "One-tap substitutions: tap the player on court and the one on the bench (or drag one onto the other).",
        "A futsal clock: stopped or running time, by half and by age group.",
        "Goals, fouls, cards and turnovers logged at the right minute.",
        "Send-offs with the penalty time tracked, and flying-goalkeeper (5v4) time kept separately.",
        "Offline first: the match is saved on the device and syncs later.",
      ] },
      { heading: "After the match", list: [
        "Minutes, entries, average stint and bench time for every player.",
        "Goals, assists and on-court involvement in goals scored and conceded (+/−).",
        "Team and player dashboards across the season.",
        "Excel/CSV export and a PDF ready to share with staff, directors or players.",
      ] },
      { heading: "Pricing (per season, + VAT)", list: [
        "Coach: 35€ — one coach and one team.",
        "Custom Coach: 60€ — custom statistics and one-to-one support.",
        "Club: 89.99€, discounted from 129€ — up to five teams, each coach with their own access.",
        "Custom: 209.99€, discounted from 299€ — custom statistics and dashboards for the club.",
        "The first month is free on every licence.",
      ] },
    ]}
    faq={[
      { question: "Is Futsal SubStats on Google Play (Android)?", answer: "Yes. It has been on the Google Play Store for Android since October 2026, on the App Store for iPhone and iPad, and in the browser." },
      { question: "What is the best app to track futsal playing time?", answer: "Futsal SubStats is built specifically for it: one-tap substitutions, per-player minutes with stopped or running clock, and it works offline." },
      { question: "Does it work for youth teams?", answer: "Yes. It is especially useful when playing time has to be shared fairly and explained to players and parents." },
      { question: "How much does it cost?", answer: "From 35€ per season (+ VAT) for one coach. The Club licence is 89.99€ (discounted from 129€). The first month is free." },
    ]}
  />;
}
