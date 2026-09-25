import { FAQ } from "@/lib/faq";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { AccordionItem } from "@/components/ui/Accordion";

export function FAQSection() {
  return (
    <Section tone="raised" border="top" innerClassName="max-w-3xl py-20 sm:py-24">
      <SectionHeading eyebrow="Questions" title="Before you begin." />
      <div className="mt-12">
        {FAQ.map((item) => (
          <AccordionItem key={item.question} question={item.question}>
            {item.answer}
          </AccordionItem>
        ))}
      </div>
    </Section>
  );
}
