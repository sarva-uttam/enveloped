import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

export function ClosingCTA() {
  return (
    <Section innerClassName="max-w-4xl py-28 text-center">
      <Reveal>
        <h2 className="font-display text-4xl sm:text-5xl">
          Your guests deserve better than <span className="italic text-blush">a printed card lost in a drawer.</span>
        </h2>
        <div className="mt-10">
          <Button href="/survey" variant="primary" withArrow className="px-8 py-4">
            Start my invite
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
