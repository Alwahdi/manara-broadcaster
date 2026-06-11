CREATE POLICY "Backend service can manage client device state"
ON public.client_device_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);