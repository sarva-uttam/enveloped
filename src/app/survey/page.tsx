import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { SurveyFlow } from "@/components/survey/SurveyFlow";
import type { EventCategory, TierId } from "@/lib/types";

export const metadata = { title: "Start your invite — Enveloped" };

export default async function SurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tier?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <SurveyFlow
          initialCategory={params.category as EventCategory | undefined}
          initialTier={params.tier as TierId | undefined}
        />
      </main>
      <Footer />
    </>
  );
}
