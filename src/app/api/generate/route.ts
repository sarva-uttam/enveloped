import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import type { SurveyAnswers } from "@/lib/types";

export const maxDuration = 60;

const ContentSchema = z.object({
  headline: z.string().describe("Short, elegant headline for the invite, e.g. couple names or event title"),
  subheadline: z.string().describe("One warm line under the headline"),
  welcomeMessage: z.string().describe("2-3 sentence welcome message in a warm, personal tone"),
  eventDetails: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe("3-5 key-value details: date, time, venue, dress code, etc."),
  closingLine: z.string().describe("One short, warm closing line"),
  suggestedPalette: z.array(z.string()).describe("4-6 hex color codes matching the requested mood"),
});

const FALLBACK_MODEL = "anthropic/claude-sonnet-4.6";

function buildPrompt(answers: SurveyAnswers) {
  return `You are a world-class invitation designer and copywriter. Write the content for a digital event invite based on these answers from the client:

Event category: ${answers.category ?? "unspecified"}
Tier: ${answers.tier ?? "unspecified"}
Names / who is being celebrated: ${answers.partnerNames || "not provided"}
Event date: ${answers.eventDate || "not provided"}
Venue: ${answers.venue || "not provided"}
City: ${answers.city || "not provided"}
Color / mood: ${answers.colorMood || "not provided"}
Favorite song: ${answers.song || "not provided"}
Extra details from client: ${answers.extraDetails || "none"}

Write warm, elegant, non-cheesy copy appropriate to the event category and cultural context implied by it (e.g. Hindu / Christian / Muslim wedding traditions where relevant — mention rituals only if implied by the category, never invent specific religious details that weren't given). Keep it concise and tasteful. Produce a hex color palette that matches the requested mood/colors.`;
}

export async function POST(req: Request) {
  const answers = (await req.json()) as SurveyAnswers;

  try {
    const { object } = await generateObject({
      model: process.env.AI_MODEL || FALLBACK_MODEL,
      schema: ContentSchema,
      prompt: buildPrompt(answers),
    });

    return NextResponse.json(object);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return NextResponse.json(
        { error: "The AI couldn't generate a valid invite. Please try again." },
        { status: 502 }
      );
    }

    console.error("generate route error", err);
    return NextResponse.json(
      {
        error:
          "AI generation is not configured yet. Add an AI Gateway or provider API key to enable this endpoint.",
      },
      { status: 503 }
    );
  }
}
