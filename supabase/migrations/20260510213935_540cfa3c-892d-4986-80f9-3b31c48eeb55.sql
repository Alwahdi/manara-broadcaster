GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

INSERT INTO public.user_roles (user_id, role)
VALUES ('53f52a7c-da1c-4672-b232-a98ebdc0558a', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;