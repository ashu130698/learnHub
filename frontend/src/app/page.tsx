"use client";
import { useQuery, gql } from "@apollo/client";

// Simple test query to confirm frontend ↔ backend connection works
const TEST_QUERY = gql`
  query TestConnection {
    modules {
      id
      title
    }
  }
`;

export default function Home() {
  const { data, loading, error } = useQuery(TEST_QUERY);

  if (loading) return <p className="p-8">Loading...</p>;
  if (error) return <p className="p-8 text-red-600">Error: {error.message}</p>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">LearnHub</h1>
      <p className="mt-2 text-gray-600">
        Backend connection working. Modules found: {data.modules.length}
      </p>
    </div>
  );
}
