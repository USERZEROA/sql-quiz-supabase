import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mining Safety SQL Quiz",
  description: "Five SQL questions using synthetic mine inspection data in a live PostgreSQL database."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
