import { neon } from '@neondatabase/serverless';

import {
  EMPLOYEE_COLOR_PALETTE,
  type AppState,
  type DayNote,
  type Employee,
  type PaymentKind,
  type SalaryPayment,
  type Shift,
} from '../src/domain/types';
import { normalizeImportedState } from '../src/domain/backup';

const DEFAULT_LOCATION = { id: 'main', name: 'Основной пункт' };
const DEFAULT_WORKSPACE_NAME = 'PVZ workspace';

type Sql = ReturnType<typeof getSql>;
type EmployeeDeletionSnapshot = {
  employee: Employee;
  shifts: Shift[];
  payments: SalaryPayment[];
};

export type WorkspaceBackupSummary = {
  id: string;
  workspaceId: string;
  createdAt: string;
  employees: number;
  shifts: number;
  payments: number;
  dayNotes: number;
};

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
  const sql = getSql();
  const defaultWorkspaceId = getDefaultWorkspaceId();

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
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists workspace_backups (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      snapshot jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
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
  await ensureDayNotesPrimaryKey(sql);
  await ensureEmployeeColors(sql, defaultWorkspaceId);
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
  const rows = await sql`
    select workspace_id
    from workspace_sessions
    where token = ${token}
    limit 1
  `;
  const workspaceId = rows[0]?.workspace_id;

  if (!workspaceId) {
    throw new UnauthorizedError();
  }

  return String(workspaceId);
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

export async function claimInvite(code: string): Promise<{ token: string; state: AppState }> {
  const inviteCode = process.env.PVZ_INVITE_CODE;

  if (!inviteCode?.trim()) {
    throw new ConfigMissingError();
  }

  if (normalizeInviteCode(code) !== normalizeInviteCode(inviteCode)) {
    throw new InvalidInviteCodeError();
  }

  const sql = getSql();
  await ensureSchema();
  const workspaceId = getDefaultWorkspaceId();
  const token = await createSession(sql, workspaceId);
  return { token, state: await getState(workspaceId) };
}

async function createSession(sql: Sql, workspaceId: string) {
  const token = crypto.randomUUID();
  await sql`
    insert into workspace_sessions (token, workspace_id)
    values (${token}, ${workspaceId})
  `;

  return token;
}

function normalizeInviteCode(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

export async function getState(workspaceId: string): Promise<AppState> {
  const sql = getSql();
  await ensureSchema();

  const [locationRows, employeeRows, shiftRows, paymentRows, dayNoteRows] = await Promise.all([
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
      select id, employee_id, to_char(work_date, 'YYYY-MM-DD') as work_date
      from shifts
      where workspace_id = ${workspaceId}
      order by work_date asc, created_at asc
    `,
    sql`
      select id, employee_id, amount, kind, note, to_char(paid_at, 'YYYY-MM-DD') as paid_at
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
  ]);

  if (!locationRows.length) {
    await sql`
      insert into locations (id, workspace_id, name)
      values (${locationRowId(workspaceId)}, ${workspaceId}, ${DEFAULT_LOCATION.name})
    `;
  }

  return {
    location: {
      id: DEFAULT_LOCATION.id,
      name: String(locationRows[0]?.name ?? DEFAULT_LOCATION.name),
    },
    employees: employeeRows.map((row): Employee => ({
      id: String(row.id),
      name: String(row.name),
      dailyRate: Number(row.daily_rate),
      color: getEmployeeColor(String(row.id), typeof row.color === 'string' ? row.color : null),
      active: Boolean(row.active),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
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
    })),
    dayNotes: dayNoteRows.map((row): DayNote => ({
      date: String(row.work_date),
      comment: String(row.note ?? ''),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
  };
}

export async function addEmployee(workspaceId: string, name: string, dailyRate: number, color?: string) {
  const sql = getSql();
  await ensureSchema();
  const selectedColor = getValidEmployeeColor(color ?? null) ?? await getNextEmployeeColor(sql, workspaceId);

  await sql`
    insert into employees (id, workspace_id, name, daily_rate, color)
    values (${crypto.randomUUID()}, ${workspaceId}, ${name}, ${Math.round(dailyRate)}, ${selectedColor})
  `;
}

export async function updateEmployeeColor(workspaceId: string, employeeId: string, color: string) {
  const sql = getSql();
  await ensureSchema();
  const selectedColor = getValidEmployeeColor(color);

  if (!selectedColor) {
    throw new Error('BAD_REQUEST');
  }

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
  await sql`
    update employees
    set active = false
    where id = ${employeeId}
      and workspace_id = ${workspaceId}
  `;
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
              'comment', payment.note
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
      insert into salary_payments (id, workspace_id, employee_id, amount, paid_at, kind, note)
      select item.id, ${workspaceId}, item.employee_id, item.amount, item.paid_at, item.kind, item.note
      from jsonb_to_recordset(cast(${paymentsJson} as jsonb)) as item(
        id text,
        employee_id text,
        amount integer,
        paid_at date,
        kind text,
        note text
      )
      on conflict do nothing
    `,
    transaction`
      delete from employee_deletion_undos
      where token = ${undoToken}
        and workspace_id = ${workspaceId}
    `,
  ]);
}

export async function toggleShift(workspaceId: string, employeeId: string, date: string) {
  const sql = getSql();
  await ensureSchema();
  await requireEmployee(sql, workspaceId, employeeId);

  const existing = await sql`
    select id
    from shifts
    where employee_id = ${employeeId}
      and workspace_id = ${workspaceId}
      and work_date = ${date}
    limit 1
  `;

  if (existing[0]?.id) {
    await sql`
      delete from shifts
      where id = ${String(existing[0].id)}
        and workspace_id = ${workspaceId}
    `;
    return;
  }

  await sql`
    insert into shifts (id, workspace_id, employee_id, work_date)
    values (${crypto.randomUUID()}, ${workspaceId}, ${employeeId}, ${date})
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
) {
  const sql = getSql();
  await ensureSchema();
  await requireEmployee(sql, workspaceId, employeeId);
  await sql`
    insert into salary_payments (id, workspace_id, employee_id, amount, paid_at, kind, note)
    values (${crypto.randomUUID()}, ${workspaceId}, ${employeeId}, ${Math.round(amount)}, ${paidAt}, ${kind}, ${comment})
  `;
}

export async function updatePayment(
  workspaceId: string,
  id: string,
  employeeId: string,
  amount: number,
  paidAt: string,
  kind: PaymentKind,
  comment: string,
) {
  const sql = getSql();
  await ensureSchema();
  await requireEmployee(sql, workspaceId, employeeId);
  await sql`
    update salary_payments
    set amount = ${Math.round(amount)},
        paid_at = ${paidAt},
        kind = ${kind},
        note = ${comment}
    where id = ${id}
      and employee_id = ${employeeId}
      and workspace_id = ${workspaceId}
  `;
}

export async function deletePayment(workspaceId: string, id: string, employeeId: string) {
  const sql = getSql();
  await ensureSchema();
  await sql`
    delete from salary_payments
    where id = ${id}
      and employee_id = ${employeeId}
      and workspace_id = ${workspaceId}
  `;
}

export async function createWorkspaceBackup(workspaceId: string): Promise<WorkspaceBackupSummary> {
  const state = await getState(workspaceId);
  const sql = getSql();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await sql.transaction((transaction) => [
    transaction`
      insert into workspace_backups (id, workspace_id, snapshot)
      values (${id}, ${workspaceId}, cast(${JSON.stringify(state)} as jsonb))
    `,
    transaction`
      delete from workspace_backups
      where workspace_id = ${workspaceId}
        and created_at < now() - interval '90 days'
    `,
    transaction`delete from employee_deletion_undos where expires_at <= now()`,
  ]);

  return {
    id,
    workspaceId,
    createdAt,
    employees: state.employees.length,
    shifts: state.shifts.length,
    payments: state.payments.length,
    dayNotes: state.dayNotes.length,
  };
}

export async function importWorkspaceState(workspaceId: string, value: unknown) {
  const nextState = normalizeImportedState(value);
  const sql = getSql();
  await ensureSchema();
  const previousState = await getState(workspaceId);
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
  const paymentsJson = JSON.stringify(nextState.payments.map((payment) => ({
    id: payment.id,
    employee_id: payment.employeeId,
    amount: payment.amount,
    paid_at: payment.paidAt,
    kind: payment.kind,
    note: payment.comment,
  })));
  const dayNotesJson = JSON.stringify(nextState.dayNotes.map((note) => ({
    work_date: note.date,
    note: note.comment,
    updated_at: note.updatedAt,
  })));

  await sql.transaction((transaction) => [
    transaction`
      insert into workspace_backups (id, workspace_id, snapshot)
      values (${crypto.randomUUID()}, ${workspaceId}, cast(${JSON.stringify(previousState)} as jsonb))
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
      insert into shifts (id, workspace_id, employee_id, work_date)
      select item.id, ${workspaceId}, item.employee_id, item.work_date
      from jsonb_to_recordset(cast(${shiftsJson} as jsonb)) as item(
        id text,
        employee_id text,
        work_date date
      )
    `,
    transaction`
      insert into salary_payments (id, workspace_id, employee_id, amount, paid_at, kind, note)
      select item.id, ${workspaceId}, item.employee_id, item.amount, item.paid_at, item.kind, item.note
      from jsonb_to_recordset(cast(${paymentsJson} as jsonb)) as item(
        id text,
        employee_id text,
        amount integer,
        paid_at date,
        kind text,
        note text
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
