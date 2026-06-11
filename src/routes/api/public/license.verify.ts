import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { z } from 'zod';

const Body = z.object({
  key: z.string().min(8).max(128),
  hardwareId: z.string().min(8).max(128),
  appVersion: z.string().max(32).optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

export const Route = createFileRoute('/api/public/license/verify')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return jsonRes(400, { ok: false, error: 'invalid_request' });
        }

        const { key, hardwareId } = parsed;

        const { data: lic, error } = await supabaseAdmin
          .from('licenses')
          .select('*')
          .eq('license_key', key)
          .maybeSingle();

        if (error || !lic) return jsonRes(404, { ok: false, error: 'license_not_found' });
        if (lic.status !== 'active') return jsonRes(403, { ok: false, error: `license_${lic.status}` });
        if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
          return jsonRes(403, { ok: false, error: 'license_expired' });
        }

        // Bind to hardware on first activation
        const nowIso = new Date().toISOString();
        if (lic.hardware_id && lic.hardware_id !== '' && lic.hardware_id !== hardwareId) {
          return jsonRes(409, { ok: false, error: 'hardware_mismatch' });
        }
        const isFirstActivation = !lic.hardware_id || lic.hardware_id === '';
        await supabaseAdmin
          .from('licenses')
          .update({
            last_check_at: nowIso,
            hardware_id: isFirstActivation ? hardwareId : lic.hardware_id,
            activated_at: isFirstActivation ? nowIso : lic.activated_at,
          })
          .eq('id', lic.id);

        return jsonRes(200, {
          ok: true,
          plan: lic.plan,
          billingCycle: lic.billing_cycle,
          maxChannels: lic.max_channels,
          maxLibraryItems: lic.max_library_items,
          whiteLabel: lic.white_label,
          expiresAt: lic.expires_at,
          customerName: lic.customer_name,
          organization: lic.organization,
          // Cache TTL — client may consider this valid for 30 days offline
          validForDays: 30,
        });
      },
    },
  },
});
