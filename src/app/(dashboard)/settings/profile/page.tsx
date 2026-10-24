import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PasswordForm, ProfileForm } from "@/components/settings/settings-forms";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requirePageUser();
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes("UTC")) timezones.unshift("UTC");
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav active="/settings/profile" isAdmin={canGlobal(user, "settings.manage")} />
      <div className="grid gap-5 xl:grid-cols-2">
        <ProfileForm name={user.name} email={user.email} timezone={user.timezone} timezones={timezones} />
        <PasswordForm />
      </div>
    </>
  );
}
