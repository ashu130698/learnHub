import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ApolloProvider } from "./providers/ApolloProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LearnHub",
  description: "Interactive developer learning platform",
};

// Root layout — wraps every single page in the app
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Every page below this can now use Apollo hooks (useQuery, useMutation) */}
        <ApolloProvider>{children}</ApolloProvider>
      </body>
    </html>
  );
}
