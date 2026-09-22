CREATE TRIGGER activity_log_no_update BEFORE UPDATE ON activity_log
BEGIN SELECT RAISE(ABORT, 'activity_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER activity_log_no_delete BEFORE DELETE ON activity_log
BEGIN SELECT RAISE(ABORT, 'activity_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER vault_access_log_no_update BEFORE UPDATE ON vault_access_log
BEGIN SELECT RAISE(ABORT, 'vault_access_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER vault_access_log_no_delete BEFORE DELETE ON vault_access_log
BEGIN SELECT RAISE(ABORT, 'vault_access_log is append-only'); END;
