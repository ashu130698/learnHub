"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@apollo/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LOGIN_MUTATION } from "@/graphql/mutations";
import { useAuthStore } from "@/store/authStore";

// Client-side validation — mirrors the server-side Zod schema
// Catches obvious mistakes before making a network request
// Login schema — v4 syntax
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email({ message: 'Please enter a valid email' }),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  // react-hook-form manages form state, validation, and submission
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema), // Zod plugs into react-hook-form here
  });

  // Apollo mutation hook — returns a function to trigger the mutation
  const [login] = useMutation(LOGIN_MUTATION);

  const onSubmit = async (formData: LoginForm) => {
    try {
      const result = await login({ variables: { input: formData } });
      const { accessToken, user } = result.data.login;

      // Update global auth state — this also stores the token in Apollo
      setUser(user, accessToken);

      router.push("/dashboard");
    } catch (err: any) {
      // Server errors (wrong password, etc.) surface here
      // Apollo Client v4 nests GraphQL errors slightly differently — check both shapes
      const message =
        err.graphQLErrors?.[0]?.message ??
        err.cause?.extensions?.message ??
        "Login failed. Please try again.";

      setError("root", { message });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          Welcome back
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          Sign in to continue learning
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {errors.root && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errors.root.message}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              {...register("email")}
              type="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              {...register("password")}
              type="password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          New to LearnHub?{" "}
          <Link
            href="/register"
            className="text-blue-600 font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
