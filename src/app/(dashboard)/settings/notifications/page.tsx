import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { smtpConfigured } from "@/lib/env";
import { getNotificationPreferences } from "@/server/services/users";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PreferencesForm } from "@/components/settings/settings-forms";

export const metadata = { title: "Notifications" };

export default async function NotificationSettingsPage() {
  const user = await requirePageUser();
  const prefs = await getNotificationPreferences(user);
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav active="/settings/notifications" isAdmin={canGlobal(user, "settings.manage")} />
      <PreferencesForm prefs={prefs} emailAvailable={smtpConfigured()} />
    </>
  );
}
