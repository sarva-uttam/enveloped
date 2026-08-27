import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enveloped — Digital invites people actually open",
  description:
    "Create a beautiful, personalized digital invite for your wedding or event in minutes — tier by tier, delivered as a moment worth clicking.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <AuthProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
