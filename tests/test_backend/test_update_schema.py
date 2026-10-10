from update_schema import MISSING_COLUMNS


def test_legacy_schema_sync_includes_email_verification_columns():
    column_types = {
        (table, column): ddl_type
        for table, column, ddl_type in MISSING_COLUMNS
    }

    assert column_types[("users", "email_verification_code_hash")] == "VARCHAR(64)"
    assert column_types[("users", "email_verification_expires_at")] == "TIMESTAMP WITH TIME ZONE"
    assert column_types[("users", "email_verification_sent_at")] == "TIMESTAMP WITH TIME ZONE"
    assert column_types[("users", "email_verification_attempts")] == "INTEGER NOT NULL DEFAULT 0"
