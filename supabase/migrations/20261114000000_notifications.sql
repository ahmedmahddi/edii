-- The weekly digest e-mail (app/api/notifications/cron): who wants it, and when it was last sent.
-- Each account sets its own choice (Mon compte; the e-mail's unsubscribe link sets it to false).
alter table public.profiles add column if not exists notifications boolean not null default true;
alter table public.profiles add column if not exists notified_at timestamptz;
