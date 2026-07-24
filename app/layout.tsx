import type { Metadata } from "next";
import { headers } from "next/headers";
import { Alegreya_Sans, Cinzel, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./entity-v5.css";

const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const alegreya = Alegreya_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") || incoming.get("host");
  const protocol =
    incoming.get("x-forwarded-proto") ||
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const title = "Obscur — The Sixfold Road";
  const description =
    "A six-seat real-time Foxyverse board game where every road remembers who crossed it.";

  return {
    title,
    description,
    icons: {
      icon: "/og.png",
      shortcut: "/og.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1672,
          height: 941,
          alt: "Obscur: The Sixfold Road ritual board and six masks",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${cinzel.variable} ${alegreya.variable} ${geistMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
