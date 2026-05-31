import { neon } from '@neondatabase/serverless';

import type { AppState, Employee, SalaryPayment, Shift } from '../src/domain/types';

const DEFAULT_LOCATION = { id: 'main', name: 'Основной пункт' };

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
  }
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  return neon(databaseUrl);
}

export async function ensureSchema() {
  const sql = getSql();

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
      paid_at date not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into locations (id, name)
    values (${DEFAULT_LOCATION.id}, ${DEFAULT_LOCATION.name})
    on conflict (id) do nothing
  `;
}

export async function getState(): Promise<AppState> {
  const sql = getSql();
  await ensureSchema();

  const [locationRows, employeeRows, shiftRows, paymentRows] = await Promise.all([
    sql`select id, name from locations where id = ${DEFAULT_LOCATION.id} limit 1`,
    sql`
      select id, name, daily_rate, active, created_at
      from employees
      order by active desc, created_at asc
    `,
    sql`
      select id, employee_id, to_char(work_date, 'YYYY-MM-DD') as work_date
      from shifts
      order by work_date asc, created_at asc
    `,
    sql`
      select id, employee_id, amount, to_char(paid_at, 'YYYY-MM-DD') as paid_at
      from salary_payments
      order by paid_at asc, created_at asc
    `,
  ]);

  return {
    location: {
      id: String(locationRows[0]?.id ?? DEFAULT_LOCATION.id),
      name: String(locationRows[0]?.name ?? DEFAULT_LOCATION.name),
    },
    employees: employeeRows.map((row): Employee => ({
      id: String(row.id),
      name: String(row.name),
      dailyRate: Number(row.daily_rate),
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
    })),
  };
}

export async function addEmployee(name: string, dailyRate: number) {
  const sql = getSql();
  await ensureSchema();
  await sql`
    insert into employees (id, name, daily_rate)
    values (${crypto.randomUUID()}, ${name}, ${Math.round(dailyRate)})
  `;
}

export async function updateLocationName(name: string) {
  const sql = getSql();
  await ensureSchema();
  await sql`
    insert into locations (id, name)
    values (${DEFAULT_LOCATION.id}, ${name})
    on conflict (id) do update
    set name = excluded.name
  `;
}

export async function archiveEmployee(employeeId: string) {
  const sql = getSql();
  await ensureSchema();
  await sql`
    update employees
    set active = false
    where id = ${employeeId}
  `;
}

export async function toggleShift(employeeId: string, date: string) {
  const sql = getSql();
  await ensureSchema();
  const existing = await sql`
    select id
    from shifts
    where employee_id = ${employeeId}
      and work_date = ${date}
    limit 1
  `;

  if (existing[0]?.id) {
    await sql`
      delete from shifts
      where id = ${String(existing[0].id)}
    `;
    return;
  }

  await sql`
    insert into shifts (id, employee_id, work_date)
    values (${crypto.randomUUID()}, ${employeeId}, ${date})
  `;
}

export async function addPayment(employeeId: string, amount: number, paidAt: string) {
  const sql = getSql();
  await ensureSchema();
  await sql`
    insert into salary_payments (id, employee_id, amount, paid_at)
    values (${crypto.randomUUID()}, ${employeeId}, ${Math.round(amount)}, ${paidAt})
  `;
}
