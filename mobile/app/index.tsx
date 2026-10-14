import { Redirect } from "expo-router";
import { useAuth } from "../src/auth";
import { Loading } from "../src/components/ui";

export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/signin" />;
  if (user.onboardingStep !== "complete") return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
