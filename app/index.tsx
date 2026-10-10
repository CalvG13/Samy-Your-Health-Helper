import { Redirect } from 'expo-router';

// Placeholder until the auth screen is built: send everyone straight to the dashboard.
export default function Index() {
  return <Redirect href="/dashboard" />;
}
