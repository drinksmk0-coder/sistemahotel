# Hospedin credentials setup

The Integracoes page includes a Hospedin credentials form. Credentials are sent to the `hospedin-credentials` Supabase Edge Function; the Client Secret is encrypted with AES-GCM before it is stored. The database table has no access for `anon` or `authenticated`.

## Required server configuration

1. Apply the migration `20261022000000_hospedin_credentials.sql`.
2. Configure the Edge Function secrets in Supabase:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HOSPEDIN_CREDENTIALS_ENCRYPTION_KEY`: a Base64-encoded 32-byte random key. Generate one securely, for example with `openssl rand -base64 32`. Store it only in Supabase function secrets/password manager, never in GitHub.
3. Deploy `supabase/functions/hospedin-credentials`.
4. Open Integracoes while signed in and save the Hospedin Client ID and Client Secret.

The credential form does not activate API synchronization. Do not enable read/write API calls until the official Hospedin API contract is confirmed. Keep a secure backup of the encryption key: the encrypted secret cannot be recovered if that key is lost.
