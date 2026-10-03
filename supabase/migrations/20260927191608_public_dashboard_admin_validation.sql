-- Allow the migration administrator to explicitly assume the restricted reader
-- for validation. The reader gains no membership in any other role.
grant metaflow_dashboard_reader to postgres with inherit false, set true;
