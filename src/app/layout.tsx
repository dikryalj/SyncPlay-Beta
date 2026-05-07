import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SyncPlay — Real-Time Audio Sharing Platform",
  description:
    "Synchronize music playback from any URL across multiple devices simultaneously. Create a room, share the code, and listen together — perfectly in sync.",
  keywords: ["music sync", "share play", "collaborative listening", "real-time audio", "syncplay"],
  authors: [{ name: "SyncPlay Engineering" }],
  openGraph: {
    title: "SyncPlay — Listen Together, In Perfect Sync",
    description: "Create a room and share music with anyone, anywhere. <50ms sync margin guaranteed.",
    type: "website",
  },
  themeColor: "#0A0A0F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full antialiased noise">{children}</body>
    </html>
  );
}
