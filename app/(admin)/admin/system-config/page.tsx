export const dynamic = "force-dynamic";

import { getSystemSettingsForAdmin } from "@/lib/actions/system-settings";
import { getExternalStoreLinks } from "@/lib/actions/external-stores";
import { SystemConfigForm } from "./system-config-form";
import { ExternalStoreSettings } from "@/components/admin/external-store-settings";

export default async function SystemConfigPage() {
  // 使用管理员专用函数获取完整配置（包含敏感字段）
  const [settings, externalStores] = await Promise.all([getSystemSettingsForAdmin(), getExternalStoreLinks()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          系统配置
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          修改可热更新的系统配置（无需重启服务）
        </p>
      </div>

      <SystemConfigForm initialValues={settings} />
      <ExternalStoreSettings initialValues={externalStores} />
    </div>
  );
}
