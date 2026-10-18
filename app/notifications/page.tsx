import { AuthedShell } from "@/components/AuthedShell";
import { NotificationsCenter } from "@/components/NotificationsCenter";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <AuthedShell>
      <NotificationsCenter />
    </AuthedShell>
  );
}
