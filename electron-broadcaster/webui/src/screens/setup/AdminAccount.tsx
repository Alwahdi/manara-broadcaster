import { SetupStep } from "@/components/SetupStep";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupAdminAccount() {
  const data = useSetup();
  const password = data.adminPassword || "";
  const valid = !!data.adminUsername && password.length >= 10 && /[a-z]/i.test(password) && /\d/.test(password) && /[^a-z0-9]/i.test(password);
  return (
    <SetupStep
      title="حساب المشرف"
      subtitle="أنشئ بيانات الدخول للوحة الإدارة."
      prev="/setup/network"
      next="/setup/branding"
      nextDisabled={!valid}
    >
      <div className="card card-pad">
        <div className="field">
          <label>اسم المستخدم *</label>
          <input className="input" autoComplete="username" value={data.adminUsername || ""} onChange={(e) => setSetup({ adminUsername: e.target.value })} />
        </div>
        <div className="field">
          <label>كلمة المرور *</label>
          <input className="input" type="password" autoComplete="new-password" value={data.adminPassword || ""} onChange={(e) => setSetup({ adminPassword: e.target.value })} />
          <span className="hint">10 أحرف على الأقل، مع حرف ورقم ورمز. تُخزّن بشكل مُجزّأ على الخادم.</span>
        </div>
      </div>
    </SetupStep>
  );
}
