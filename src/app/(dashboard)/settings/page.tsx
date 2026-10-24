import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PlatformForm } from "@/components/settings/settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  if (!canGlobal(user, "settings.manage")) redirect("/settings/profile");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav active="/settings" isAdmin />
      <PlatformForm settings={settings} />
    </>
  );
}
