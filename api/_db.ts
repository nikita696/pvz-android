import { neon } from '@neondatabase/serverless';

import {
  EMPLOYEE_COLOR_PALETTE,
  type AppState,
  type DayNote,
  type Employee,
  type EmployeeRate,
  type PaymentKind,
  type SalaryPayment,
  type Shift,
  type WorkspaceBackupPreview,
  type WorkspaceBackupSource,
  type WorkspaceBackupSummary,
} from '../src/domain/types';
import { InvalidBackupError, normalizeImportedState } from '../src/domain/backup';

const DEFAULT_LOCATION = { id: 'main', name: 'Основной пункт' };
const DEFAULT_WORKSPACE_NAME = 'PVZ workspace';
const DEFAULT_SESSION_TTL_DAYS = 180;
const EMPLOYEE_RATE_BASELINE_DATE = '1900-01-01';

type Sql = ReturnType<typeof getSql>;
type EmployeeDeletionSnapshot = {
  employee: Employee;
  rateHistory?: EmployeeRate[];
  shifts: Shift[];
  payments: SalaryPayment[];
};
type PaymentDeletionSnapshot = SalaryPayment;
type GetStateOptions = {
  includeBackups?: boolean;
  backupPreview?: WorkspaceBackupPreview;
};

let schemaPromise: Promise<void> | null = null;
let schemaDatabaseUrl = '';

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('UNAUTHORIZED');
  }
}

export class InvalidInviteCodeError extends Error {
  constructor() {
    super('INVALID_INVITE_CODE');
  }
}

export class ConfigMissingError extends Error {
  constructor() {
    super('CONFIG_MISSING');
  }
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super('PAYMENT_NOT_FOUND');
  }
}

export class PaymentUndoUnavailableError extends Error {
  constructor() {
    super('PAYMENT_UNDO_UNAVAILABLE');
  }
}

export class PaymentConflictError extends Error {
  constructor() {
    super('PAYMENT_CONFLICT');
  }
}

export class ResourceConflictError extends Error {
  constructor() {
    super('CONFLICT');
  }
}

export class BackupNotFoundError extends Error {
  constructor() {
    super('BACKUP_NOT_FOUND');
  }
}

export class InviteRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED');
  }
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  return neon(databaseUrl);
}

function getDefaultWorkspaceId() {
  return process.env.PVZ_DEFAULT_WORKSPACE_ID?.trim() || 'nick-main';
}

export async function ensureSchema() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  if (!schemaPromise || schemaDatabaseUrl !== databaseUrl) {
    schemaDatabaseUrl = databaseUrl;
    schemaPromise = initializeSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

async function initializeSchema() {
  const sql = getSql();
  const defaultWorkspaceId = getDefaultWorkspaceId();
  const sessionTtlDays = getSessionTtlDays();

  await sql`
    create table if not exists workspaces (
      id text primary key,
      name text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists workspace_sessions (
      token text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      created_at timestamptz not null default now(),
      last_used_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '180 days')
    )
  `;
  await sql`alter table workspace_sessions add column if not exists last_used_at timestamptz`;
  await sql`alter table workspace_sessions add column if not exists expires_at timestamptz`;
  await sql`
    update workspace_sessions
    set last_used_at = coalesce(last_used_at, created_at, now()),
        expires_at = coalesce(expires_at, now() + (${sessionTtlDays} * interval '1 day'))
    where last_used_at is null or expires_at is null
  `;
  await sql`alter table workspace_sessions alter column last_used_at set default now()`;
  await sql`alter table workspace_sessions alter column last_used_at set not null`;
  await sql`
    alter table workspace_sessions
    alter column expires_at set default (now() + interval '180 days')
  `;
  await sql`alter table workspace_sessions alter column expires_at set not null`;
  await sql`
    create table if not exists workspace_backups (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      snapshot jsonb not null,
      source text not null default 'legacy',
      created_at timestamptz not null default now()
    )
  `;
  await sql`alter table workspace_backups add column if not exists source text not null default 'legacy'`;
  await sql`
    create index if not exists workspace_backups_workspace_created_idx
    on workspace_backups (workspace_id, created_at desc)
  `;
  await sql`
    create table if not exists employee_deletion_undos (
      token text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      snapshot jsonb not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create index if not exists employee_deletion_undos_workspace_expires_idx
    on employee_deletion_undos (workspace_id, expires_at)
  `;
  await sql`
    create table if not exists payment_deletion_undos (
      token text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      snapshot jsonb not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create index if not exists payment_deletion_undos_workspace_expires_idx
    on payment_deletion_undos (workspace_id, expires_at)
  `;
  await sql`
    create table if not exists invite_rate_limits (
      client_key text primary key,
      attempts integer not null default 0,
      window_started_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into workspaces (id, name)
    values (${defaultWorkspaceId}, ${DEFAULT_WORKSPACE_NAME})
    on conflict (id) do nothing
  `;
  await sql`
    create table if not exists locations (
      id text primary key,
      name text not null
    )
  `;
  await sql`
    create table if not exists employees (
      id text primary key,
      name text not null,
      daily_rate integer not null check (daily_rate >= 0),
      active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists employee_rate_history (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      employee_id text not null references employees(id) on delete cascade,
      daily_rate integer not null check (daily_rate >= 0),
      effective_date date not null,
      created_at timestamptz not null default now(),
      unique(employee_id, effective_date)
    )
  `;
  await sql`
    create index if not exists employee_rate_history_workspace_employee_date_idx
    on employee_rate_history (workspace_id, employee_id, effective_date)
  `;
  await sql`
    create table if not exists shifts (
      id text primary key,
      employee_id text not null references employees(id) on delete cascade,
      work_date date not null,
      created_at timestamptz not null default now(),
      unique(employee_id, work_date)
    )
  `;
  await sql`
    create table if not exists salary_payments (
      id text primary key,
      employee_id text not null references employees(id) on delete cascade,
      amount integer not null check (amount >= 0),
      kind text not null default 'payment',
      note text not null default '',
      paid_at date not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists day_notes (
      work_date date primary key,
      note text not null default '',
      updated_at timestamptz not null default now()
    )
  `;
  await addWorkspaceColumn(sql, 'locations', defaultWorkspaceId);
  await addWorkspaceColumn(sql, 'employees', defaultWorkspaceId);
  await addWorkspaceColumn(sql, 'shifts', defaultWorkspaceId);
  await addWorkspaceColumn(sql, 'salary_payments', defaultWorkspaceId);
  await addWorkspaceColumn(sql, 'day_notes', defaultWorkspaceId);
  await sql`
    alter table employees
    add column if not exists color text
  `;
  await sql`
    alter table salary_payments
    add column if not exists kind text not null default 'payment'
  `;
  await sql`
    alter table salary_payments
    add column if not exists note text not null default ''
  `;
  await sql`alter table salary_payments add column if not exists updated_at timestamptz`;
  await sql`
    update salary_payments
    set updated_at = coalesce(updated_at, created_at, now())
    where updated_at is null
  `;
  await sql`alter table salary_payments alter column updated_at set default now()`;
  await sql`alter table salary_payments alter column updated_at set not null`;
  await ensureDayNotesPrimaryKey(sql);
  await ensureEmployeeColors(sql, defaultWorkspaceId);
  await ensureEmployeeRateHistory(sql);
  await sql`
    insert into locations (id, workspace_id, name)
    select ${DEFAULT_LOCATION.id}, ${defaultWorkspaceId}, ${DEFAULT_LOCATION.name}
    where not exists (
      select 1 from locations where workspace_id = ${defaultWorkspaceId}
    )
    on conflict (id) do nothing
  `;
}

async function addWorkspaceColumn(sql: Sql, tableName: string, defaultWorkspaceId: string) {
  await sql.query(`alter table ${tableName} add column if not exists workspace_id text`);
  await sql.query(`update ${tableName} set workspace_id = $1 where workspace_id is null`, [defaultWorkspaceId]);
  await sql.query(`alter table ${tableName} alter column workspace_id set not null`);
}

async function ensureDayNotesPrimaryKey(sql: Sql) {
  await sql`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'day_notes'::regclass
          and conname = 'day_notes_pkey'
          and pg_get_constraintdef(oid) = 'PRIMARY KEY (workspace_id, work_date)'
      ) then
        alter table day_notes drop constraint if exists day_notes_pkey;
        alter table day_notes add constraint day_notes_pkey primary key (workspace_id, work_date);
      end if;
    end $$;
  `;
}

async function ensureEmployeeColors(sql: Sql, workspaceId: string) {
  const rows = await sql`
    select id, color
    from employees
    where workspace_id = ${workspaceId}
    order by active desc, created_at asc
  `;
  const usedColors = new Set<string>();

  for (const row of rows) {
    const employeeId = String(row.id);
    const currentColor = getValidEmployeeColor(typeof row.color === 'string' ? row.color : null);
    const nextColor = currentColor && !usedColors.has(currentColor)
      ? currentColor
      : getFirstAvailableEmployeeColor(usedColors, employeeId);

    usedColors.add(nextColor);

    if (row.color !== nextColor) {
      await sql`
        update employees
        set color = ${nextColor}
        where id = ${employeeId}
          and workspace_id = ${workspaceId}
      `;
    }
  }
}

export async function requireWorkspaceSession(token: string | null): Promise<string> {
  if (!token) {
    throw new UnauthorizedError();
  }

  const sql = getSql();
  await ensureSchema();
  const sessionTtlDays = getSessionTtlDays();
  const rows = await sql`
    update workspace_sessions
    set last_used_at = now(),
        expires_at = now() + (${sessionTtlDays} * interval '1 day')
    where token = ${token}
      and expires_at > now()
    returning workspace_id
  `;
  const workspaceId = rows[0]?.workspace_id;

  if (!workspaceId) {
    throw new UnauthorizedError();
  }

  return String(workspaceId);
}

export async function revokeWorkspaceSession(workspaceId: string, token: string) {
  const sql = getSql();
  await ensureSchema();
  await sql`
    delete from workspace_sessions
    where token = ${token}
      and workspace_id = ${workspaceId}
  `;
}

export async function createWorkspace(): Promise<{ token: string; state: AppState }> {
  const sql = getSql();
  await ensureSchema();

  const workspaceId = `workspace-${crypto.randomUUID()}`;
  await sql`
    insert into workspaces (id, name)
    values (${workspaceId}, ${DEFAULT_WORKSPACE_NAME})
  `;
  await sql`
    insert into locations (id, workspace_id, name)
    values (${locationRowId(workspaceId)}, ${workspaceId}, ${DEFAULT_LOCATION.name})
  `;

  const token = await createSession(sql, workspaceId);
  return { token, state: await getState(workspaceId) };
}

export async function claimInvite(code: string, clientKey = 'unknown'): Promise<{ token: string; state: AppState }> {
  const inviteCode = process.env.PVZ_INVITE_CODE;

  if (!inviteCode?.trim()) {
    throw new ConfigMissingError();
  }

  const sql = getSql();
  await ensureSchema();
  await checkInviteRateLimit(sql, clientKey);

  if (normalizeInviteCode(code) !== normalizeInviteCode(inviteCode)) {
    throw new InvalidInviteCodeError();
  }

  const workspaceId = getDefaultWorkspaceId();
  const token = await createSession(sql, workspaceId);
  await sql`delete from invite_rate_limits where client_key = ${clientKey}`;
  await sql`delete from workspace_sessions where expires_at <= now()`;
  return { token, state: await getState(workspaceId) };
}

async function checkInviteRateLimit(sql: Sql, clientKey: string) {
  const rows = await sql`
    insert into invite_rate_limits (client_key, attempts, window_started_at, updated_at)
    values (${clientKey}, 1, now(), now())
    on conflict (client_key) do update
    set attempts = case
          when invite_rate_limits.window_started_at < now() - interval '10 minutes' then 1
          else invite_rate_limits.attempts + 1
        end,
        window_started_at = case
          when invite_rate_limits.window_started_at < now() - interval '10 minutes' then now()
          else invite_rate_limits.window_started_at
        end,
        updated_at = now()
    returning attempts, window_started_at
  `;
  const attempts = Number(rows[0]?.attempts ?? 1);

  if (attempts > 8) {
    const windowStartedAt = new Date(String(rows[0]?.window_started_at ?? new Date().toISOString()));
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStartedAt.getTime() + 10 * 60_000 - Date.now()) / 1000),
    );
    throw new InviteRateLimitError(retryAfterSeconds);
  }

  await sql`
    delete from invite_rate_limits
    where updated_at < now() - interval '1 day'
  `;
}

async function createSession(sql: Sql, workspaceId: string) {
  const token = crypto.randomUUID();
  const sessionTtlDays = getSessionTtlDays();
  await sql`
    insert into workspace_sessions (token, workspace_id, last_used_at, expires_at)
    values (${token}, ${workspaceId}, now(), now() + (${sessionTtlDays} * interval '1 day'))
  `;

  return token;
}

function normalizeInviteCode(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

export async function getState(workspaceId: string, options: GetStateOptions = {}): Promise<AppState> {
  const sql = getSql();
  await ensureSchema();

  const [locationRows, employeeRows, rateRows, shiftRows, paymentRows, dayNoteRows, backupRows] = await Promise.all([
    sql`
      select id, name
      from locations
      where workspace_id = ${workspaceId}
      order by case when id = ${DEFAULT_LOCATION.id} then 0 else 1 end
      limit 1
    `,
    sql`
      select id, name, daily_rate, color, active, created_at
      from employees
      where workspace_id = ${workspaceId}
      order by active desc, created_at asc
    `,
    sql`
      select id, employee_id, daily_rate,
             to_char(effective_date, 'YYYY-MM-DD') as effective_date,
             created_at
      from employee_rate_history
      where workspace_id = ${workspaceId}
      order by effective_date asc, created_at asc
    `,
    sql`
      select id, employee_id, to_char(work_date, 'YYYY-MM-DD') as work_date
      from shifts
      where workspace_id = ${workspaceId}
      order by work_date asc, created_at asc
    `,
    sql`
      select id, employee_id, amount, kind, note,
             to_char(paid_at, 'YYYY-MM-DD') as paid_at,
             updated_at
      from salary_payments
      where workspace_id = ${workspaceId}
      order by paid_at asc, created_at asc
    `,
    sql`
      select to_char(work_date, 'YYYY-MM-DD') as work_date, note, updated_at
      from day_notes
      where workspace_id = ${workspaceId}
      order by work_date asc
    `,
    options.includeBackups === false
      ? Promise.resolve([])
      : sql`
          select
            id,
            source,
            created_at,
            coalesce(snapshot #>> '{location,name}', ${DEFAULT_LOCATION.name}) as location_name,
            jsonb_array_length(coalesce(snapshot -> 'employees', '[]'::jsonb)) as employees,
            jsonb_array_length(coalesce(snapshot -> 'shifts', '[]'::jsonb)) as shifts,
            jsonb_array_length(coalesce(snapshot -> 'payments', '[]'::jsonb)) as payments,
            jsonb_array_length(coalesce(snapshot -> 'dayNotes', '[]'::jsonb)) as day_notes
          from workspace_backups
          where workspace_id = ${workspaceId}
          order by created_at desc
          limit 7
        `,
  ]);

  if (!locationRows.length) {
    await sql`
      insert into locations (id, workspace_id, name)
      values (${locationRowId(workspaceId)}, ${workspaceId}, ${DEFAULT_LOCATION.name})
    `;
  }

  const ratesByEmployee = new Map<string, EmployeeRate[]>();

  for (const row of rateRows) {
    const employeeId = String(row.employee_id);
    const rates = ratesByEmployee.get(employeeId) ?? [];
    rates.push({
      id: String(row.id),
      dailyRate: Number(row.daily_rate),
      effectiveDate: String(row.effective_date),
      createdAt: new Date(String(row.created_at)).toISOString(),
    });
    ratesByEmployee.set(employeeId, rates);
  }

  const state: AppState = {
    location: {
      id: DEFAULT_LOCATION.id,
      name: String(locationRows[0]?.name ?? DEFAULT_LOCATION.name),
    },
    employees: employeeRows.map((row): Employee => {
      const employeeId = String(row.id);
      const rateHistory = ratesByEmployee.get(employeeId) ?? [];

      return {
        id: employeeId,
        name: String(row.name),
        dailyRate: getEffectiveDailyRate(rateHistory, Number(row.daily_rate)),
        color: getEmployeeColor(employeeId, typeof row.color === 'string' ? row.color : null),
        active: Boolean(row.active),
        createdAt: new Date(String(row.created_at)).toISOString(),
        rateHistory,
      };
    }),
    shifts: shiftRows.map((row): Shift => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      date: String(row.work_date),
    })),
    payments: paymentRows.map((row): SalaryPayment => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      amount: Number(row.amount),
      paidAt: String(row.paid_at),
      kind: row.kind === 'deduction' ? 'deduction' : 'payment',
      comment: String(row.note ?? ''),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    dayNotes: dayNoteRows.map((row): DayNote => ({
      date: String(row.work_date),
      comment: String(row.note ?? ''),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    backups: backupRows.map(mapWorkspaceBackupSummary),
  };

  if (options.backupPreview) {
    state.backupPreview = options.backupPreview;
  }

  return state;
}

export async function addEmployee(
  workspaceId: string,
  name: string,
  dailyRate: number,
  color?: string,
  requestedId?: string,
) {
  const sql = getSql();
  await ensureSchema();
  const employeeId = requestedId ?? crypto.randomUUID();
  const selectedColor = getValidEmployeeColor(color ?? null) ?? await getNextEmployeeColor(sql, workspaceId);

  if (color) {
    await ensureEmployeeColorAvailable(sql, workspaceId, selectedColor, requestedId);
  }

  const insertedRows = await sql`
    insert into employees (id, workspace_id, name, daily_rate, color)
    values (${employeeId}, ${workspaceId}, ${name}, ${dailyRate}, ${selectedColor})
    on conflict (id) do nothing
    returning id
  `;

  if (!insertedRows.length) {
    const existingRows = await sql`
      select name, daily_rate, color
      from employees
      where id = ${employeeId}
        and workspace_id = ${workspaceId}
      limit 1
    `;
    const existing = existingRows[0];

    if (
      !existing ||
      String(existing.name) !== name ||
      Number(existing.daily_rate) !== dailyRate ||
      (color && String(existing.color).toLowerCase() !== selectedColor.toLowerCase())
    ) {
      throw new ResourceConflictError();
    }
  }

  await sql`
    insert into employee_rate_history (
      id,
      workspace_id,
      employee_id,
      daily_rate,
      effective_date
    )
    values (
      ${`rate-baseline:${employeeId}`},
      ${workspaceId},
      ${employeeId},
      ${dailyRate},
      ${EMPLOYEE_RATE_BASELINE_DATE}
    )
    on conflict (employee_id, effective_date) do nothing
  `;
}

export async function updateEmployee(
  workspaceId: string,
  employeeId: string,
  name?: string,
  dailyRate?: number,
  effectiveDate?: string,
) {
  const sql = getSql();
  await ensureSchema();
  const employeeRows = await sql`
    select id
    from employees
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
    limit 1
  `;

  if (!employeeRows.length) {
    throw new Error('BAD_REQUEST');
  }

  if (dailyRate !== undefined && effectiveDate !== undefined) {
    await sql.transaction((transaction) => [
      name === undefined
        ? transaction`select 1`
        : transaction`
            update employees
            set name = ${name}
            where id = ${employeeId}
              and workspace_id = ${workspaceId}
          `,
      transaction`
        insert into employee_rate_history (
          id,
          workspace_id,
          employee_id,
          daily_rate,
          effective_date
        )
        values (
          ${crypto.randomUUID()},
          ${workspaceId},
          ${employeeId},
          ${dailyRate},
          ${effectiveDate}
        )
        on conflict (employee_id, effective_date) do update
        set daily_rate = excluded.daily_rate
      `,
      transaction`
        update employees
        set daily_rate = coalesce((
          select rate.daily_rate
          from employee_rate_history as rate
          where rate.workspace_id = ${workspaceId}
            and rate.employee_id = ${employeeId}
            and rate.effective_date <= current_date
          order by rate.effective_date desc, rate.created_at desc
          limit 1
        ), daily_rate)
        where id = ${employeeId}
          and workspace_id = ${workspaceId}
      `,
    ]);
    return;
  }

  if (name !== undefined) {
    await sql`
      update employees
      set name = ${name}
      where id = ${employeeId}
        and workspace_id = ${workspaceId}
    `;
  }
}

export async function updateEmployeeColor(workspaceId: string, employeeId: string, color: string) {
  const sql = getSql();
  await ensureSchema();
  const selectedColor = getValidEmployeeColor(color);

  if (!selectedColor) {
    throw new Error('BAD_REQUEST');
  }

  await ensureEmployeeColorAvailable(sql, workspaceId, selectedColor, employeeId);

  const rows = await sql`
    update employees
    set color = ${selectedColor}
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
    returning id
  `;

  if (!rows.length) {
    throw new Error('BAD_REQUEST');
  }
}

async function ensureEmployeeRateHistory(sql: Sql) {
  await sql`
    insert into employee_rate_history (
      id,
      workspace_id,
      employee_id,
      daily_rate,
      effective_date,
      created_at
    )
    select
      'rate-baseline:' || employee.id,
      employee.workspace_id,
      employee.id,
      employee.daily_rate,
      ${EMPLOYEE_RATE_BASELINE_DATE}::date,
      employee.created_at
    from employees as employee
    where not exists (
      select 1
      from employee_rate_history as rate
      where rate.employee_id = employee.id
        and rate.workspace_id = employee.workspace_id
    )
    on conflict do nothing
  `;
}

export async function updateLocationName(workspaceId: string, name: string) {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`
    update locations
    set name = ${name}
    where workspace_id = ${workspaceId}
    returning id
  `;

  if (rows.length) {
    return;
  }

  await sql`
    insert into locations (id, workspace_id, name)
    values (${locationRowId(workspaceId)}, ${workspaceId}, ${name})
  `;
}

export async function archiveEmployee(workspaceId: string, employeeId: string) {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`
    update employees
    set active = false
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
    returning id
  `;

  if (!rows.length) {
    throw new Error('BAD_REQUEST');
  }
}

export async function deleteArchivedEmployee(workspaceId: string, employeeId: string, undoToken: string) {
  const sql = getSql();
  await ensureSchema();
  await sql`delete from employee_deletion_undos where expires_at <= now()`;
  const deletedRows = await sql`
    with target_employee as (
      select id, name, daily_rate, color, active, created_at
      from employees
      where id = ${employeeId}
        and workspace_id = ${workspaceId}
        and active = false
      for update
    ), saved_undo as (
      insert into employee_deletion_undos (token, workspace_id, snapshot, expires_at)
      select
        ${undoToken},
        ${workspaceId},
        jsonb_build_object(
          'employee', jsonb_build_object(
            'id', employee.id,
            'name', employee.name,
            'dailyRate', employee.daily_rate,
            'color', employee.color,
            'active', employee.active,
            'createdAt', employee.created_at
          ),
          'rateHistory', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', rate.id,
              'dailyRate', rate.daily_rate,
              'effectiveDate', to_char(rate.effective_date, 'YYYY-MM-DD'),
              'createdAt', rate.created_at
            ) order by rate.effective_date asc, rate.created_at asc)
            from employee_rate_history as rate
            where rate.workspace_id = ${workspaceId}
              and rate.employee_id = employee.id
          ), '[]'::jsonb),
          'shifts', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', shift.id,
              'employeeId', shift.employee_id,
              'date', to_char(shift.work_date, 'YYYY-MM-DD')
            ))
            from shifts as shift
            where shift.workspace_id = ${workspaceId}
              and shift.employee_id = employee.id
          ), '[]'::jsonb),
          'payments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', payment.id,
              'employeeId', payment.employee_id,
              'amount', payment.amount,
              'paidAt', to_char(payment.paid_at, 'YYYY-MM-DD'),
              'kind', payment.kind,
              'comment', payment.note,
              'updatedAt', payment.updated_at
            ))
            from salary_payments as payment
            where payment.workspace_id = ${workspaceId}
              and payment.employee_id = employee.id
          ), '[]'::jsonb)
        ),
        now() + interval '40 seconds'
      from target_employee as employee
      returning token
    )
    delete from employees
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
      and exists (select 1 from saved_undo)
    returning id
  `;

  if (!deletedRows.length) {
    throw new Error('BAD_REQUEST');
  }
}

export async function restoreDeletedEmployee(workspaceId: string, undoToken: string) {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`
    select snapshot
    from employee_deletion_undos
    where token = ${undoToken}
      and workspace_id = ${workspaceId}
      and expires_at > now()
    limit 1
  `;
  const snapshot = readEmployeeDeletionSnapshot(rows[0]?.snapshot);

  if (!snapshot) {
    throw new Error('BAD_REQUEST');
  }

  const rateHistory = snapshot.rateHistory?.length
    ? snapshot.rateHistory
    : [{
        id: `rate-baseline:${snapshot.employee.id}`,
        dailyRate: snapshot.employee.dailyRate,
        effectiveDate: EMPLOYEE_RATE_BASELINE_DATE,
        createdAt: snapshot.employee.createdAt,
      }];
  const ratesJson = JSON.stringify(rateHistory.map((rate) => ({
    id: rate.id,
    daily_rate: rate.dailyRate,
    effective_date: rate.effectiveDate,
    created_at: rate.createdAt,
  })));
  const shiftsJson = JSON.stringify(snapshot.shifts.map((shift) => ({
    id: shift.id,
    employee_id: shift.employeeId,
    work_date: shift.date,
  })));
  const paymentsJson = JSON.stringify(snapshot.payments.map((payment) => ({
    id: payment.id,
    employee_id: payment.employeeId,
    amount: payment.amount,
    paid_at: payment.paidAt,
    kind: payment.kind,
    note: payment.comment,
    updated_at: payment.updatedAt ?? new Date().toISOString(),
  })));

  await sql.transaction((transaction) => [
    transaction`
      insert into employees (id, workspace_id, name, daily_rate, color, active, created_at)
      values (
        ${snapshot.employee.id},
        ${workspaceId},
        ${snapshot.employee.name},
        ${snapshot.employee.dailyRate},
        ${snapshot.employee.color},
        ${snapshot.employee.active},
        ${snapshot.employee.createdAt}
      )
      on conflict (id) do nothing
    `,
    transaction`
      insert into employee_rate_history (
        id,
        workspace_id,
        employee_id,
        daily_rate,
        effective_date,
        created_at
      )
      select
        item.id,
        ${workspaceId},
        ${snapshot.employee.id},
        item.daily_rate,
        item.effective_date,
        item.created_at
      from jsonb_to_recordset(cast(${ratesJson} as jsonb)) as item(
        id text,
        daily_rate integer,
        effective_date date,
        created_at timestamptz
      )
      on conflict do nothing
    `,
    transaction`
      insert into shifts (id, workspace_id, employee_id, work_date)
      select item.id, ${workspaceId}, item.employee_id, item.work_date
      from jsonb_to_recordset(cast(${shiftsJson} as jsonb)) as item(
        id text,
        employee_id text,
        work_date date
      )
      on conflict do nothing
    `,
    transaction`
      insert into salary_payments (
        id,
        workspace_id,
        employee_id,
        amount,
        paid_at,
        kind,
        note,
        updated_at
      )
      select
        item.id,
        ${workspaceId},
        item.employee_id,
        item.amount,
        item.paid_at,
        item.kind,
        item.note,
        item.updated_at
      from jsonb_to_recordset(cast(${paymentsJson} as jsonb)) as item(
        id text,
        employee_id text,
        amount integer,
        paid_at date,
        kind text,
        note text,
        updated_at timestamptz
      )
      on conflict do nothing
    `,
  ]);
}

export async function toggleShift(workspaceId: string, employeeId: string, date: string) {
  const sql = getSql();
  await ensureSchema();
  const statusRows = await sql`
    select
      employee.active,
      exists (
        select 1
        from shifts
        where shifts.employee_id = employee.id
          and shifts.workspace_id = ${workspaceId}
          and shifts.work_date = ${date}
      ) as has_shift
    from employees as employee
    where employee.id = ${employeeId}
      and employee.workspace_id = ${workspaceId}
    limit 1
  `;

  if (!statusRows.length || (!statusRows[0].active && !statusRows[0].has_shift)) {
    throw new Error('BAD_REQUEST');
  }

  await sql`
    with deleted as (
      delete from shifts
      where employee_id = ${employeeId}
        and workspace_id = ${workspaceId}
        and work_date = ${date}
      returning id
    )
    insert into shifts (id, workspace_id, employee_id, work_date)
    select ${crypto.randomUUID()}, ${workspaceId}, ${employeeId}, ${date}
    where not exists (select 1 from deleted)
      and exists (
        select 1
        from employees
        where id = ${employeeId}
          and workspace_id = ${workspaceId}
          and active = true
      )
    on conflict (employee_id, work_date) do nothing
  `;
}

export async function setShift(
  workspaceId: string,
  employeeId: string,
  date: string,
  assigned: boolean,
) {
  const sql = getSql();
  await ensureSchema();

  if (assigned) {
    await requireActiveEmployee(sql, workspaceId, employeeId);
    await sql`
      insert into shifts (id, workspace_id, employee_id, work_date)
      select ${crypto.randomUUID()}, ${workspaceId}, employee.id, ${date}
      from employees as employee
      where employee.id = ${employeeId}
        and employee.workspace_id = ${workspaceId}
        and employee.active = true
      on conflict (employee_id, work_date) do nothing
    `;
    return;
  }

  await requireEmployee(sql, workspaceId, employeeId);

  await sql`
    delete from shifts
    where employee_id = ${employeeId}
      and workspace_id = ${workspaceId}
      and work_date = ${date}
  `;
}

export async function saveDayNote(workspaceId: string, date: string, comment: string) {
  const sql = getSql();
  await ensureSchema();
  const note = comment.trim();

  if (!note) {
    await sql`
      delete from day_notes
      where workspace_id = ${workspaceId}
        and work_date = ${date}
    `;
    return;
  }

  await sql`
    insert into day_notes (workspace_id, work_date, note)
    values (${workspaceId}, ${date}, ${note})
    on conflict (workspace_id, work_date) do update
    set note = excluded.note,
        updated_at = now()
  `;
}

export async function addPayment(
  workspaceId: string,
  employeeId: string,
  amount: number,
  paidAt: string,
  kind: PaymentKind,
  comment: string,
  requestedId?: string,
) {
  const sql = getSql();
  await ensureSchema();
  await requireEmployee(sql, workspaceId, employeeId);
  const paymentId = requestedId ?? crypto.randomUUID();
  const insertedRows = await sql`
    insert into salary_payments (id, workspace_id, employee_id, amount, paid_at, kind, note)
    values (${paymentId}, ${workspaceId}, ${employeeId}, ${amount}, ${paidAt}, ${kind}, ${comment})
    on conflict (id) do nothing
    returning id
  `;

  if (insertedRows.length) {
    return;
  }

  const existingRows = await sql`
    select employee_id, amount, to_char(paid_at, 'YYYY-MM-DD') as paid_at, kind, note
    from salary_payments
    where id = ${paymentId}
      and workspace_id = ${workspaceId}
    limit 1
  `;
  const existing = existingRows[0];

  if (
    !existing ||
    String(existing.employee_id) !== employeeId ||
    Number(existing.amount) !== amount ||
    String(existing.paid_at) !== paidAt ||
    String(existing.kind) !== kind ||
    String(existing.note ?? '') !== comment
  ) {
    throw new ResourceConflictError();
  }
}

export async function restoreEmployee(workspaceId: string, employeeId: string) {
  const sql = getSql();
  await ensureSchema();
  const employeeRows = await sql`
    select color
    from employees
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
    limit 1
  `;

  if (!employeeRows.length) {
    throw new Error('BAD_REQUEST');
  }

  const color = getEmployeeColor(
    employeeId,
    typeof employeeRows[0].color === 'string' ? employeeRows[0].color : null,
  );
  await ensureEmployeeColorAvailable(sql, workspaceId, color, employeeId);
  const rows = await sql`
    update employees
    set active = true
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
    returning id
  `;

  if (!rows.length) {
    throw new Error('BAD_REQUEST');
  }
}

export async function updatePayment(
  workspaceId: string,
  id: string,
  employeeId: string,
  amount: number,
  paidAt: string,
  kind: PaymentKind,
  comment: string,
  expectedUpdatedAt?: string,
) {
  const sql = getSql();
  await ensureSchema();
  await requireEmployee(sql, workspaceId, employeeId);
  const rows = await sql`
    update salary_payments
    set amount = ${amount},
        paid_at = ${paidAt},
        kind = ${kind},
        note = ${comment},
        updated_at = now()
    where id = ${id}
      and employee_id = ${employeeId}
      and workspace_id = ${workspaceId}
      and (
        ${expectedUpdatedAt ?? null}::timestamptz is null
        or date_trunc('milliseconds', updated_at) = ${expectedUpdatedAt ?? null}::timestamptz
      )
    returning id, updated_at
  `;

  if (!rows.length) {
    if (expectedUpdatedAt) {
      const existingRows = await sql`
        select id
        from salary_payments
        where id = ${id}
          and employee_id = ${employeeId}
          and workspace_id = ${workspaceId}
        limit 1
      `;

      if (existingRows.length) {
        throw new PaymentConflictError();
      }
    }

    throw new PaymentNotFoundError();
  }
}

export async function deletePayment(
  workspaceId: string,
  id: string,
  employeeId: string,
  undoToken: string,
  expectedUpdatedAt?: string,
) {
  const sql = getSql();
  await ensureSchema();
  await sql`delete from payment_deletion_undos where expires_at <= now()`;
  const rows = await sql`
    with target_payment as (
      select id, employee_id, amount, paid_at, kind, note, updated_at
      from salary_payments
      where id = ${id}
        and employee_id = ${employeeId}
        and workspace_id = ${workspaceId}
        and (
          ${expectedUpdatedAt ?? null}::timestamptz is null
          or date_trunc('milliseconds', updated_at) = ${expectedUpdatedAt ?? null}::timestamptz
        )
      for update
    ), saved_undo as (
      insert into payment_deletion_undos (token, workspace_id, snapshot, expires_at)
      select
        ${undoToken},
        ${workspaceId},
        jsonb_build_object(
          'id', payment.id,
          'employeeId', payment.employee_id,
          'amount', payment.amount,
          'paidAt', to_char(payment.paid_at, 'YYYY-MM-DD'),
          'kind', payment.kind,
          'comment', payment.note,
          'updatedAt', payment.updated_at
        ),
        now() + interval '40 seconds'
      from target_payment as payment
      returning token
    )
    delete from salary_payments
    where id = ${id}
      and employee_id = ${employeeId}
      and workspace_id = ${workspaceId}
      and exists (select 1 from saved_undo)
    returning id
  `;

  if (!rows.length) {
    if (expectedUpdatedAt) {
      const existingRows = await sql`
        select id
        from salary_payments
        where id = ${id}
          and employee_id = ${employeeId}
          and workspace_id = ${workspaceId}
        limit 1
      `;

      if (existingRows.length) {
        throw new PaymentConflictError();
      }
    }

    throw new PaymentNotFoundError();
  }
}

export async function restoreDeletedPayment(workspaceId: string, undoToken: string) {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`
    select snapshot
    from payment_deletion_undos
    where token = ${undoToken}
      and workspace_id = ${workspaceId}
      and expires_at > now()
    limit 1
  `;
  const payment = readPaymentDeletionSnapshot(rows[0]?.snapshot);

  if (!payment) {
    throw new PaymentUndoUnavailableError();
  }

  await requireEmployee(sql, workspaceId, payment.employeeId);
  await sql.transaction((transaction) => [
    transaction`
      insert into salary_payments (id, workspace_id, employee_id, amount, paid_at, kind, note, updated_at)
      values (
        ${payment.id},
        ${workspaceId},
        ${payment.employeeId},
        ${payment.amount},
        ${payment.paidAt},
        ${payment.kind},
        ${payment.comment},
        ${payment.updatedAt ?? new Date().toISOString()}
      )
      on conflict (id) do nothing
    `,
  ]);
}

export async function createWorkspaceBackup(
  workspaceId: string,
  source: WorkspaceBackupSource = 'daily',
): Promise<WorkspaceBackupSummary> {
  const state = await getState(workspaceId, { includeBackups: false });
  const sql = getSql();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await sql.transaction((transaction) => [
    transaction`
      insert into workspace_backups (id, workspace_id, snapshot, source, created_at)
      values (${id}, ${workspaceId}, cast(${JSON.stringify(state)} as jsonb), ${source}, ${createdAt})
    `,
    transaction`
      delete from workspace_backups
      where workspace_id = ${workspaceId}
        and created_at < now() - interval '90 days'
    `,
    transaction`delete from employee_deletion_undos where expires_at <= now()`,
    transaction`delete from payment_deletion_undos where expires_at <= now()`,
  ]);

  return {
    id,
    createdAt,
    source,
    locationName: state.location.name,
    employees: state.employees.length,
    shifts: state.shifts.length,
    payments: state.payments.length,
    dayNotes: state.dayNotes.length,
  };
}

export async function previewWorkspaceBackup(
  workspaceId: string,
  backupId: string,
): Promise<WorkspaceBackupPreview> {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`
    select snapshot, source, created_at
    from workspace_backups
    where id = ${backupId}
      and workspace_id = ${workspaceId}
    limit 1
  `;

  if (!rows.length) {
    throw new BackupNotFoundError();
  }

  const rawState = readStoredState(rows[0].snapshot);
  const state = normalizeImportedState(rawState);
  const dates = [
    ...state.shifts.map((shift) => shift.date),
    ...state.payments.map((payment) => payment.paidAt),
    ...state.dayNotes.map((note) => note.date),
  ].sort();

  return {
    id: backupId,
    createdAt: new Date(String(rows[0].created_at)).toISOString(),
    source: readBackupSource(rows[0].source),
    locationName: state.location.name,
    employees: state.employees.length,
    shifts: state.shifts.length,
    payments: state.payments.length,
    dayNotes: state.dayNotes.length,
    employeeNames: state.employees.map((employee) => employee.name),
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

export async function restoreWorkspaceBackup(workspaceId: string, backupId: string) {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`
    select snapshot
    from workspace_backups
    where id = ${backupId}
      and workspace_id = ${workspaceId}
    limit 1
  `;

  if (!rows.length) {
    throw new BackupNotFoundError();
  }

  await importWorkspaceState(workspaceId, readStoredState(rows[0].snapshot), 'pre-restore');
}

export async function importWorkspaceState(
  workspaceId: string,
  value: unknown,
  backupSource: WorkspaceBackupSource = 'pre-import',
) {
  const nextState = normalizeImportedState(value);
  const sql = getSql();
  await ensureSchema();
  const previousState = await getState(workspaceId, { includeBackups: false });
  const importedRates = readImportedRateHistory(value, nextState);
  const importedPaymentUpdatedAt = readImportedPaymentUpdatedAt(value);
  const employeesJson = JSON.stringify(nextState.employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    daily_rate: employee.dailyRate,
    color: employee.color,
    active: employee.active,
    created_at: employee.createdAt,
  })));
  const shiftsJson = JSON.stringify(nextState.shifts.map((shift) => ({
    id: shift.id,
    employee_id: shift.employeeId,
    work_date: shift.date,
  })));
  const ratesJson = JSON.stringify(importedRates.map((rate) => ({
    id: rate.id,
    employee_id: rate.employeeId,
    daily_rate: rate.dailyRate,
    effective_date: rate.effectiveDate,
    created_at: rate.createdAt,
  })));
  const paymentsJson = JSON.stringify(nextState.payments.map((payment) => ({
    id: payment.id,
    employee_id: payment.employeeId,
    amount: payment.amount,
    paid_at: payment.paidAt,
    kind: payment.kind,
    note: payment.comment,
    updated_at: importedPaymentUpdatedAt.get(payment.id) ?? payment.updatedAt ?? new Date().toISOString(),
  })));
  const dayNotesJson = JSON.stringify(nextState.dayNotes.map((note) => ({
    work_date: note.date,
    note: note.comment,
    updated_at: note.updatedAt,
  })));

  await sql.transaction((transaction) => [
    transaction`
      insert into workspace_backups (id, workspace_id, snapshot, source)
      values (
        ${crypto.randomUUID()},
        ${workspaceId},
        cast(${JSON.stringify(previousState)} as jsonb),
        ${backupSource}
      )
    `,
    transaction`delete from salary_payments where workspace_id = ${workspaceId}`,
    transaction`delete from shifts where workspace_id = ${workspaceId}`,
    transaction`delete from day_notes where workspace_id = ${workspaceId}`,
    transaction`delete from employees where workspace_id = ${workspaceId}`,
    transaction`delete from locations where workspace_id = ${workspaceId}`,
    transaction`
      insert into locations (id, workspace_id, name)
      values (${locationRowId(workspaceId)}, ${workspaceId}, ${nextState.location.name})
    `,
    transaction`
      insert into employees (id, workspace_id, name, daily_rate, color, active, created_at)
      select item.id, ${workspaceId}, item.name, item.daily_rate, item.color, item.active, item.created_at
      from jsonb_to_recordset(cast(${employeesJson} as jsonb)) as item(
        id text,
        name text,
        daily_rate integer,
        color text,
        active boolean,
        created_at timestamptz
      )
    `,
    transaction`
      insert into employee_rate_history (
        id,
        workspace_id,
        employee_id,
        daily_rate,
        effective_date,
        created_at
      )
      select
        item.id,
        ${workspaceId},
        item.employee_id,
        item.daily_rate,
        item.effective_date,
        item.created_at
      from jsonb_to_recordset(cast(${ratesJson} as jsonb)) as item(
        id text,
        employee_id text,
        daily_rate integer,
        effective_date date,
        created_at timestamptz
      )
    `,
    transaction`
      insert into shifts (id, workspace_id, employee_id, work_date)
      select item.id, ${workspaceId}, item.employee_id, item.work_date
      from jsonb_to_recordset(cast(${shiftsJson} as jsonb)) as item(
        id text,
        employee_id text,
        work_date date
      )
    `,
    transaction`
      insert into salary_payments (
        id,
        workspace_id,
        employee_id,
        amount,
        paid_at,
        kind,
        note,
        updated_at
      )
      select
        item.id,
        ${workspaceId},
        item.employee_id,
        item.amount,
        item.paid_at,
        item.kind,
        item.note,
        item.updated_at
      from jsonb_to_recordset(cast(${paymentsJson} as jsonb)) as item(
        id text,
        employee_id text,
        amount integer,
        paid_at date,
        kind text,
        note text,
        updated_at timestamptz
      )
    `,
    transaction`
      insert into day_notes (workspace_id, work_date, note, updated_at)
      select ${workspaceId}, item.work_date, item.note, item.updated_at
      from jsonb_to_recordset(cast(${dayNotesJson} as jsonb)) as item(
        work_date date,
        note text,
        updated_at timestamptz
      )
    `,
  ]);
}

function readEmployeeDeletionSnapshot(value: unknown): EmployeeDeletionSnapshot | null {
  const snapshot = (typeof value === 'string' ? JSON.parse(value) : value) as Partial<EmployeeDeletionSnapshot> | null;

  if (
    !snapshot?.employee ||
    typeof snapshot.employee.id !== 'string' ||
    !Array.isArray(snapshot.shifts) ||
    !Array.isArray(snapshot.payments)
  ) {
    return null;
  }

  return snapshot as EmployeeDeletionSnapshot;
}

function readPaymentDeletionSnapshot(value: unknown): PaymentDeletionSnapshot | null {
  const snapshot = (typeof value === 'string' ? JSON.parse(value) : value) as Partial<SalaryPayment> | null;

  if (
    !snapshot ||
    typeof snapshot.id !== 'string' ||
    typeof snapshot.employeeId !== 'string' ||
    typeof snapshot.amount !== 'number' ||
    typeof snapshot.paidAt !== 'string' ||
    (snapshot.kind !== 'payment' && snapshot.kind !== 'deduction') ||
    typeof snapshot.comment !== 'string'
  ) {
    return null;
  }

  return snapshot as SalaryPayment;
}

type ImportedEmployeeRate = EmployeeRate & { employeeId: string };

function readImportedRateHistory(value: unknown, state: AppState): ImportedEmployeeRate[] {
  const sourceEmployees = isRecord(value) && Array.isArray(value.employees) ? value.employees : [];
  const sourceById = new Map<string, Record<string, unknown>>();

  for (const item of sourceEmployees) {
    if (isRecord(item) && typeof item.id === 'string') {
      sourceById.set(item.id, item);
    }
  }

  const result: ImportedEmployeeRate[] = [];
  const usedRateIds = new Set<string>();

  for (const employee of state.employees) {
    const rawHistory = sourceById.get(employee.id)?.rateHistory;

    if (rawHistory === undefined || (Array.isArray(rawHistory) && rawHistory.length === 0)) {
      const baselineId = `rate-baseline:${employee.id}`;
      if (usedRateIds.has(baselineId)) {
        throw new InvalidBackupError('В истории ставок повторяются идентификаторы.');
      }

      usedRateIds.add(baselineId);
      result.push({
        id: baselineId,
        employeeId: employee.id,
        dailyRate: employee.dailyRate,
        effectiveDate: EMPLOYEE_RATE_BASELINE_DATE,
        createdAt: employee.createdAt,
      });
      continue;
    }

    if (!Array.isArray(rawHistory) || rawHistory.length > 500) {
      throw new InvalidBackupError('Некорректная история ставок сотрудника.');
    }

    const usedDates = new Set<string>();

    for (const item of rawHistory) {
      if (!isRecord(item)) {
        throw new InvalidBackupError('Некорректная история ставок сотрудника.');
      }

      const id = readStoredId(item.id);
      const dailyRate = Number(item.dailyRate);
      const effectiveDate = readStoredDate(item.effectiveDate);
      const createdAt = readStoredTimestamp(item.createdAt, employee.createdAt);

      if (
        !id ||
        !Number.isSafeInteger(dailyRate) ||
        dailyRate < 0 ||
        dailyRate > 2_147_483_647 ||
        !effectiveDate ||
        usedRateIds.has(id) ||
        usedDates.has(effectiveDate)
      ) {
        throw new InvalidBackupError('Некорректная история ставок сотрудника.');
      }

      usedRateIds.add(id);
      usedDates.add(effectiveDate);
      result.push({ id, employeeId: employee.id, dailyRate, effectiveDate, createdAt });

      if (result.length > 10_000) {
        throw new InvalidBackupError('В копии слишком много изменений ставок.');
      }
    }
  }

  return result;
}

function readImportedPaymentUpdatedAt(value: unknown): Map<string, string> {
  const result = new Map<string, string>();

  if (!isRecord(value) || !Array.isArray(value.payments)) {
    return result;
  }

  for (const item of value.payments) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.updatedAt === undefined) {
      continue;
    }

    const updatedAt = readStoredTimestamp(item.updatedAt);
    if (!updatedAt) {
      throw new InvalidBackupError('Некорректная дата изменения выплаты.');
    }

    result.set(item.id, updatedAt);
  }

  return result;
}

function mapWorkspaceBackupSummary(row: Record<string, unknown>): WorkspaceBackupSummary {
  return {
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    source: readBackupSource(row.source),
    locationName: String(row.location_name ?? DEFAULT_LOCATION.name),
    employees: Number(row.employees ?? 0),
    shifts: Number(row.shifts ?? 0),
    payments: Number(row.payments ?? 0),
    dayNotes: Number(row.day_notes ?? 0),
  };
}

function readBackupSource(value: unknown): WorkspaceBackupSource {
  return value === 'daily' ||
    value === 'pre-import' ||
    value === 'pre-restore' ||
    value === 'manual'
    ? value
    : 'legacy';
}

function readStoredState(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new InvalidBackupError('Серверная резервная копия повреждена.');
  }
}

function readStoredId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 160
    ? value.trim()
    : null;
}

function readStoredDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? value
    : null;
}

function readStoredTimestamp(value: unknown, fallback = ''): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return fallback;
  }

  return new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getEffectiveDailyRate(rateHistory: EmployeeRate[], fallback: number): number {
  const today = new Date().toISOString().slice(0, 10);
  let currentRate = fallback;

  for (const rate of rateHistory) {
    if (rate.effectiveDate <= today) {
      currentRate = rate.dailyRate;
    }
  }

  return currentRate;
}

function getSessionTtlDays() {
  const configured = Number(process.env.PVZ_SESSION_TTL_DAYS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 3_650
    ? configured
    : DEFAULT_SESSION_TTL_DAYS;
}

async function getNextEmployeeColor(sql: Sql, workspaceId: string) {
  const rows = await sql`
    select id, color
    from employees
    where workspace_id = ${workspaceId}
      and active = true
    order by created_at asc
  `;
  const usedColors = new Set(
    rows.map((row) => getEmployeeColor(String(row.id), typeof row.color === 'string' ? row.color : null)),
  );

  return getFirstAvailableEmployeeColor(usedColors, crypto.randomUUID());
}

async function ensureEmployeeColorAvailable(
  sql: Sql,
  workspaceId: string,
  color: string,
  excludedEmployeeId?: string,
) {
  const rows = await sql`
    select id
    from employees
    where workspace_id = ${workspaceId}
      and active = true
      and lower(color) = lower(${color})
      and (
        ${excludedEmployeeId ?? null}::text is null
        or id <> ${excludedEmployeeId ?? null}::text
      )
    limit 1
  `;

  if (rows.length) {
    throw new ResourceConflictError();
  }
}

function getFirstAvailableEmployeeColor(usedColors: Set<string>, seed: string) {
  const availableColor = EMPLOYEE_COLOR_PALETTE.find((color) => !usedColors.has(color));

  if (availableColor) {
    return availableColor;
  }

  return EMPLOYEE_COLOR_PALETTE[getEmployeeColorIndex(seed)];
}

function getValidEmployeeColor(color: string | null): string | null {
  if (!color) {
    return null;
  }

  const normalizedColor = color.trim().toLowerCase();
  return EMPLOYEE_COLOR_PALETTE.find((paletteColor) => paletteColor.toLowerCase() === normalizedColor) ?? null;
}

async function requireEmployee(sql: Sql, workspaceId: string, employeeId: string) {
  const rows = await sql`
    select id
    from employees
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
    limit 1
  `;

  if (!rows.length) {
    throw new Error('BAD_REQUEST');
  }
}

async function requireActiveEmployee(sql: Sql, workspaceId: string, employeeId: string) {
  const rows = await sql`
    select id
    from employees
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
      and active = true
    limit 1
  `;

  if (!rows.length) {
    throw new Error('BAD_REQUEST');
  }
}

function locationRowId(workspaceId: string) {
  return `location:${workspaceId}`;
}

function getEmployeeColor(employeeId: string, savedColor: string | null): string {
  return getValidEmployeeColor(savedColor) ?? EMPLOYEE_COLOR_PALETTE[getEmployeeColorIndex(employeeId)];
}

function getEmployeeColorIndex(employeeId: string): number {
  const hash = [...employeeId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return hash % EMPLOYEE_COLOR_PALETTE.length;
}
