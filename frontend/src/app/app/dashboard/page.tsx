"use client";
import { useCallback, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { useAuthStore } from "@/store/authStore";
import { useWebSocket, type WsEvent } from "@/hooks/useWebSocket";

const DASHBOARD_QUERY = gql`
  query Dashboard {
    dashboard {
      totalModules
      completedModules
      inProgressModules
      overallScore
      recentAttempts {
        id
        score
        passed
        createdAt
      }
    }
  }
`;

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data, loading, error, refetch } = useQuery(DASHBOARD_QUERY);

  // Track the most recent real-time event to show a toast-style notice
  const [liveNotice, setLiveNotice] = useState<string | null>(null);

  // Called whenever the WebSocket receives a message from the server
  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      switch (event.type) {
        case "quiz_submitted": {
          const payload = event.payload as { score: number; passed: boolean };
          setLiveNotice(
            `Quiz submitted — scored ${payload.score}% (${payload.passed ? "Passed" : "Failed"})`,
          );
          // Dashboard data just changed on the server (cache was invalidated there)
          // Refetch to show the new numbers immediately — no manual page refresh needed
          refetch();
          break;
        }
        case "lesson_completed": {
          setLiveNotice("Lesson marked complete");
          refetch();
          break;
        }
        case "pong":
          // Keepalive response — no UI action needed
          break;
      }

      // Clear the notice after 4 seconds
      if (event.type !== "pong") {
        setTimeout(() => setLiveNotice(null), 4000);
      }
    },
    [refetch],
  );

  // Only connect the WebSocket once the user is actually logged in
  useWebSocket({ onEvent: handleWsEvent, enabled: !!user });

  if (loading) return <p className="p-8">Loading dashboard...</p>;
  if (error) return <p className="p-8 text-red-600">Error: {error.message}</p>;

  const dashboard = data.dashboard;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-gray-600">
        Welcome, {user?.profile.name ?? "guest"}
      </p>

      {/* Real-time notification banner — appears when a WS event arrives */}
      {liveNotice && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm animate-pulse">
          🔴 Live: {liveNotice}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="p-4 bg-white border rounded-lg">
          <p className="text-xs text-gray-500 uppercase">Total Modules</p>
          <p className="text-2xl font-semibold">{dashboard.totalModules}</p>
        </div>
        <div className="p-4 bg-white border rounded-lg">
          <p className="text-xs text-gray-500 uppercase">Completed</p>
          <p className="text-2xl font-semibold">{dashboard.completedModules}</p>
        </div>
        <div className="p-4 bg-white border rounded-lg">
          <p className="text-xs text-gray-500 uppercase">Avg Score</p>
          <p className="text-2xl font-semibold">{dashboard.overallScore}%</p>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Recent Attempts
        </h2>
        {dashboard.recentAttempts.length === 0 ? (
          <p className="text-sm text-gray-400">No quiz attempts yet.</p>
        ) : (
          <div className="space-y-2">
            {dashboard.recentAttempts.map((attempt: any) => (
              <div
                key={attempt.id}
                className="flex justify-between p-3 bg-white border rounded-lg text-sm"
              >
                <span>{new Date(attempt.createdAt).toLocaleDateString()}</span>
                <span
                  className={attempt.passed ? "text-green-600" : "text-red-600"}
                >
                  {attempt.score}% — {attempt.passed ? "Passed" : "Failed"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
