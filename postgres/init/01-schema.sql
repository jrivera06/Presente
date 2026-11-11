-- Modelo de datos inicial del checador. Sin extensiones propietarias.

CREATE TABLE employees (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entra_oid     UUID NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    department    TEXT,
    schedule_start TIME NOT NULL DEFAULT '09:00',
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shift_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    type        TEXT NOT NULL CHECK (type IN ('clock_in','clock_out','break_start','break_end')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source      TEXT NOT NULL DEFAULT 'teams' CHECK (source IN ('teams','web')),
    raw_payload JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shift_events_employee_time ON shift_events (employee_id, occurred_at);

CREATE TABLE shifts (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id    BIGINT NOT NULL REFERENCES employees(id),
    started_at     TIMESTAMPTZ NOT NULL,
    ended_at       TIMESTAMPTZ,
    minutes_worked INTEGER,
    he_minutes     INTEGER NOT NULL DEFAULT 0,   -- horas extra
    late_minutes   INTEGER NOT NULL DEFAULT 0,   -- retardo
    status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','closed','pending_signature','signed')),
    week_start     DATE NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (employee_id, started_at)
);

CREATE INDEX idx_shifts_week ON shifts (week_start, employee_id);

CREATE TABLE weekly_records (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id      BIGINT NOT NULL REFERENCES employees(id),
    week_start       DATE NOT NULL,
    total_minutes    INTEGER NOT NULL DEFAULT 0,
    he_minutes       INTEGER NOT NULL DEFAULT 0,
    late_minutes     INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','pending_signature','signed')),
    signed_at        TIMESTAMPTZ,
    signed_by        TEXT,
    signature_hash   TEXT,
    pdf_object_key   TEXT,
    UNIQUE (employee_id, week_start)
);

CREATE TABLE notifications (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id   BIGINT NOT NULL REFERENCES employees(id),
    kind          TEXT NOT NULL CHECK (kind IN ('preaviso_cierre','resumen_semanal','recordatorio_firma')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at       TIMESTAMPTZ,
    payload       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_pending ON notifications (scheduled_for) WHERE sent_at IS NULL;

-- El sistema nunca debe saber dónde corre: nada de URLs absolutas ni SDKs de nube aquí.
