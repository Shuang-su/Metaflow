-- Allow Supabase Edge Functions that use the service-role key to write into
-- the private analytics schema through PostgREST.
grant usage on schema analytics to service_role;

grant select, insert, update, delete on all tables in schema analytics to service_role;
grant usage, select, update on all sequences in schema analytics to service_role;

alter default privileges in schema analytics
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema analytics
grant usage, select, update on sequences to service_role;
