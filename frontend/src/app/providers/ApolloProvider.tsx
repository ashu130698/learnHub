"use client";
import { ApolloProvider as BaseApolloProvider } from "@apollo/client";
import { apolloClient } from "@/lib/apollo";

// Wrapper needed because ApolloProvider must be a Client Component
// but layout.tsx (its parent) is a Server Component by default
export function ApolloProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseApolloProvider client={apolloClient}>{children}</BaseApolloProvider>
  );
}
