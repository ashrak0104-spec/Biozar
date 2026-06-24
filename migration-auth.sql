-- ═══════════════════════════════════════════════════
-- BIOZAR – Migration Auth Supabase
-- Exécuter dans Supabase → SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Table des profils utilisateurs (liée à auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('admin','production','commercial','logistics','operator')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index pour recherche par email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 3. Trigger : créer auto un profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS : les utilisateurs lisent leur propre profil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. Fonction pour créer un user admin (exécuter après)
-- SELECT create_biozar_admin('admin@biozar.mg', 'biozar2026', 'Admin Direction', 'admin');
CREATE OR REPLACE FUNCTION create_biozar_admin(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role TEXT
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := extensions.uuid_generate_v4();
  -- Insérer dans auth.users via la fonction interne
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES (
    v_user_id,
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('name', p_name, 'role', p_role)
  );
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- 6. RLS sur biozar_state (table principale de l'état applicatif)
-- ════════════════════════════════════════════════════════════════
-- Note : L'application utilise la clé anon (service key) pour lire/écrire
-- l'état global. Ces politiques permettent le fonctionnement actuel tout
-- en activant RLS. À terme, migrer vers auth.uid() quand Supabase Auth
-- sera intégré dans l'app.

ALTER TABLE public.biozar_state ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde peut lire l'état (nécessaire pour le load initial)
CREATE POLICY "Allow read biozar_state"
  ON public.biozar_state FOR SELECT
  USING (true);

-- Politique : tout le monde peut insérer/mettre à jour (l'app sauvegarde
-- l'état complet via la clé anon). La PK id='appState' évite les doublons.
CREATE POLICY "Allow insert biozar_state"
  ON public.biozar_state FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update biozar_state"
  ON public.biozar_state FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Politique : tout le monde peut supprimer (utilisé pour les backups
-- et la réinitialisation des données)
CREATE POLICY "Allow delete biozar_state"
  ON public.biozar_state FOR DELETE
  USING (true);
