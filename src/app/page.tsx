import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { ExperienceShowcase } from "@/components/site/ExperienceShowcase";
import { DesignShowcase } from "@/components/site/DesignShowcase";
import { Categories } from "@/components/site/Categories";
import { TierPreview } from "@/components/site/TierPreview";
import { ConciergeVsSelfService } from "@/components/site/ConciergeVsSelfService";
import { FeatureStory } from "@/components/site/FeatureStory";
import { TrustSection } from "@/components/site/TrustSection";
import { Testimonials } from "@/components/site/Testimonials";
import { SponsorBelt } from "@/components/site/SponsorBelt";
import { FAQSection } from "@/components/site/FAQSection";
import { ClosingCTA } from "@/components/site/ClosingCTA";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <ExperienceShowcase />
        <DesignShowcase />
        <Categories />
        <TierPreview />
        <ConciergeVsSelfService />
        <FeatureStory />
        <TrustSection />
        <Testimonials />
        <SponsorBelt />
        <FAQSection />
        <ClosingCTA />
      </main>
      <Footer />
    </>
  );
}
