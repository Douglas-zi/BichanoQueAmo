# Supabase

`reset_and_setup.sql` is the canonical backend definition for this project.
Use it to recreate a development or demo environment from scratch.

It includes:

- public schema reset
- app tables and enum types
- RPC functions used by the app
- RLS policies and grants
- triggers
- Storage bucket and policies
- initial service and setting data

The script is destructive. Do not run it against production data that must be
preserved.

## Legacy SQL Patches

Files in `patches/` are retained as implementation history. Their changes have
already been folded into `reset_and_setup.sql`, so they are not part of the
normal setup flow for new environments.

When changing the database during this prototype phase, update
`reset_and_setup.sql` first. Add a patch only when an existing remote database
needs a one-off transition that cannot be handled by the reset script.

## Legacy Edge Function

`functions/invite-staff/` is not used by the active app flow. Staff registration
currently happens through the `admin_register_staff` RPC from the admin panel.
