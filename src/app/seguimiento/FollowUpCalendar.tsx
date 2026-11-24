"use client";

import {
  useMemo,
  useState,
} from "react";
import styles from "./seguimiento.module.css";

export type FollowUpCalendarEntry = {
  id: string;
  prospectId?: string;
  kind:
    | "FOLLOW_UP"
    | "QUOTATION_DEADLINE"
    | "RENEWAL"
    | "PAYMENT"
    | "EXPENSE"
    | "SUPPORT"
    | "TASK";
  company: string;
  date: string;
  status: string;
  assignedTo: string;
  quotationNumber: string;
  href?: string;
};

type CalendarFilter =
  | "ALL"
  | "COMMERCIAL"
  | "RENEWAL"
  | "FINANCE"
  | "OPERATION";

type CalendarView = "AGENDA" | "MONTH";

const weekdays = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
];

const filters: Array<{ value: CalendarFilter; label: string }> = [
  { value: "ALL", label: "Todo" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "RENEWAL", label: "Renovaciones" },
  { value: "FINANCE", label: "Finanzas" },
  { value: "OPERATION", label: "Operación" },
];

function chileDateKey() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Santiago",
    },
  ).format(new Date());
}

function monthLabel(monthKey: string) {
  const date = new Date(
    `${monthKey}-01T12:00:00Z`,
  );
  const label = new Intl.DateTimeFormat(
    "es-CL",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);

  return (
    label.charAt(0).toUpperCase() +
    label.slice(1)
  );
}

function moveMonth(
  monthKey: string,
  offset: number,
) {
  const [year, month] = monthKey
    .split("-")
    .map(Number);
  const date = new Date(
    Date.UTC(year, month - 1 + offset, 1),
  );

  return date.toISOString().slice(0, 7);
}

function buildCalendarDays(monthKey: string) {
  const [year, month] = monthKey
    .split("-")
    .map(Number);
  const firstDay = new Date(
    Date.UTC(year, month - 1, 1),
  );
  const mondayOffset =
    (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(
    gridStart.getUTCDate() - mondayOffset,
  );
  const lastDay = new Date(
    Date.UTC(year, month, 0),
  );
  const occupiedDays =
    mondayOffset + lastDay.getUTCDate();
  const cellCount =
    occupiedDays > 35 ? 42 : 35;

  return Array.from(
    { length: cellCount },
    (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(
        gridStart.getUTCDate() + index,
      );

      return {
        key: date.toISOString().slice(0, 10),
        day: date.getUTCDate(),
        currentMonth:
          date.getUTCMonth() === month - 1,
      };
    },
  );
}

function goToEntry(entry: FollowUpCalendarEntry) {
  if (entry.prospectId) {
    document
      .getElementById(`prospect-${entry.prospectId}`)
      ?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    return;
  }

  if (entry.href) {
    window.location.assign(entry.href);
  }
}

function eventLabel(entry: FollowUpCalendarEntry) {
  if (entry.kind === "QUOTATION_DEADLINE") {
    return `Vence ${entry.quotationNumber} · ${entry.status}`;
  }
  if (entry.kind === "FOLLOW_UP") return entry.quotationNumber || entry.status;
  if (entry.kind === "RENEWAL") return `Renovación · ${entry.status}`;
  if (entry.kind === "PAYMENT") return `Cobro · ${entry.status}`;
  if (entry.kind === "EXPENSE") return `Gasto · ${entry.status}`;
  if (entry.kind === "SUPPORT") return `Solicitud · ${entry.status}`;
  return entry.status || "Trabajo programado";
}

function eventClass(kind: FollowUpCalendarEntry["kind"]) {
  if (kind === "QUOTATION_DEADLINE") return styles.calendarDeadlineEvent;
  if (kind === "RENEWAL" || kind === "PAYMENT" || kind === "EXPENSE") {
    return styles.calendarFinanceEvent;
  }
  if (kind === "TASK" || kind === "SUPPORT") return styles.calendarOperationEvent;
  return undefined;
}

function entryFilter(kind: FollowUpCalendarEntry["kind"]): CalendarFilter {
  if (kind === "FOLLOW_UP" || kind === "QUOTATION_DEADLINE") {
    return "COMMERCIAL";
  }

  if (kind === "RENEWAL") {
    return "RENEWAL";
  }

  if (kind === "PAYMENT" || kind === "EXPENSE") {
    return "FINANCE";
  }

  return "OPERATION";
}

function entryTypeLabel(kind: FollowUpCalendarEntry["kind"]) {
  return {
    FOLLOW_UP: "Seguimiento",
    QUOTATION_DEADLINE: "Cotización",
    RENEWAL: "Renovación",
    PAYMENT: "Cobro",
    EXPENSE: "Gasto",
    SUPPORT: "Solicitud",
    TASK: "Tarea",
  }[kind];
}

function shortDateParts(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);

  return {
    day: new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      timeZone: "UTC",
    }).format(date),
    month: new Intl.DateTimeFormat("es-CL", {
      month: "short",
      timeZone: "UTC",
    })
      .format(date)
      .replace(".", ""),
    full: new Intl.DateTimeFormat("es-CL", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
}

export default function FollowUpCalendar({
  entries,
}: {
  entries: FollowUpCalendarEntry[];
}) {
  const today = chileDateKey();
  const currentMonth = today.slice(0, 7);
  const firstUpcoming = [...entries]
    .filter((entry) => entry.date >= today)
    .sort((first, second) =>
      first.date.localeCompare(second.date),
    )[0];
  const hasCurrentMonthEntries =
    entries.some((entry) =>
      entry.date.startsWith(currentMonth),
    );
  const [visibleMonth, setVisibleMonth] =
    useState(
      hasCurrentMonthEntries
        ? currentMonth
        : firstUpcoming?.date.slice(0, 7) ||
            currentMonth,
    );
  const [activeFilter, setActiveFilter] =
    useState<CalendarFilter>("ALL");
  const [view, setView] =
    useState<CalendarView>("AGENDA");

  const filteredEntries = useMemo(
    () =>
      activeFilter === "ALL"
        ? entries
        : entries.filter((entry) => entryFilter(entry.kind) === activeFilter),
    [activeFilter, entries],
  );
  const filterCounts = useMemo(() => {
    const counts: Record<CalendarFilter, number> = {
      ALL: entries.length,
      COMMERCIAL: 0,
      RENEWAL: 0,
      FINANCE: 0,
      OPERATION: 0,
    };

    entries.forEach((entry) => {
      counts[entryFilter(entry.kind)] += 1;
    });

    return counts;
  }, [entries]);

  const days = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth],
  );
  const eventsByDate = useMemo(() => {
    const grouped = new Map<
      string,
      FollowUpCalendarEntry[]
    >();

    filteredEntries.forEach((entry) => {
      const current =
        grouped.get(entry.date) ?? [];
      current.push(entry);
      grouped.set(entry.date, current);
    });

    return grouped;
  }, [filteredEntries]);
  const overdue = filteredEntries
    .filter((entry) => entry.date < today)
    .sort((first, second) =>
      second.date.localeCompare(first.date),
    );
  const visibleCount = filteredEntries.filter(
    (entry) =>
      entry.date.startsWith(visibleMonth),
  ).length;
  const agendaEntries = useMemo(
    () =>
      [...filteredEntries].sort((first, second) =>
        first.date < today && second.date < today
          ? second.date.localeCompare(first.date)
          : first.date < today
            ? -1
            : second.date < today
              ? 1
              : first.date.localeCompare(second.date),
      ),
    [filteredEntries, today],
  );

  return (
    <section className={styles.calendarPanel}>
      <div className={styles.calendarHeader}>
        <div>
          <span className={styles.eyebrow}>
            Agenda integral
          </span>
          <h2>Calendario general</h2>
          <p>
            Seguimientos, cotizaciones, renovaciones, cobros, gastos y trabajos en un solo lugar.
          </p>
        </div>

        <div className={styles.calendarViewToggle} role="group" aria-label="Vista de seguimiento">
          <button
            aria-pressed={view === "AGENDA"}
            className={view === "AGENDA" ? styles.calendarViewActive : undefined}
            onClick={() => setView("AGENDA")}
            type="button"
          >
            Agenda
          </button>
          <button
            aria-pressed={view === "MONTH"}
            className={view === "MONTH" ? styles.calendarViewActive : undefined}
            onClick={() => setView("MONTH")}
            type="button"
          >
            Mes
          </button>
        </div>
      </div>

      <div className={styles.calendarFilters}>
        <div aria-label="Filtrar agenda" role="group">
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.value}
              className={activeFilter === filter.value ? styles.calendarFilterActive : undefined}
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              type="button"
            >
              <span>{filter.label}</span>
              <strong>{filterCounts[filter.value]}</strong>
            </button>
          ))}
        </div>

        {view === "MONTH" ? (
          <div className={styles.calendarNavigation}>
            <button
              aria-label="Mes anterior"
              onClick={() => setVisibleMonth((month) => moveMonth(month, -1))}
              type="button"
            >
              Anterior
            </button>
            <strong>{monthLabel(visibleMonth)}</strong>
            <button
              aria-label="Mes siguiente"
              onClick={() => setVisibleMonth((month) => moveMonth(month, 1))}
              type="button"
            >
              Siguiente
            </button>
            <button
              className={styles.todayButton}
              onClick={() => setVisibleMonth(currentMonth)}
              type="button"
            >
              Hoy
            </button>
          </div>
        ) : (
          <span className={styles.calendarFilterSummary}>
            {filteredEntries.length} compromiso{filteredEntries.length === 1 ? "" : "s"} con fecha
          </span>
        )}
      </div>

      {overdue.length > 0 && (
        <div className={styles.overdueStrip}>
          <div>
            <strong>
              {overdue.length} hito
              {overdue.length === 1 ? "" : "s"} vencido
              {overdue.length === 1 ? "" : "s"}
            </strong>
            <span>
              Requieren contacto o una nueva fecha.
            </span>
          </div>

          <div className={styles.overdueActions}>
            {overdue.slice(0, 3).map((entry) => (
              <button
                key={entry.id}
                onClick={() =>
                  goToEntry(entry)
                }
                type="button"
              >
                {entry.kind === "QUOTATION_DEADLINE"
                  ? `${entry.company} · ${eventLabel(entry)}`
                  : entry.company}
              </button>
            ))}
            {overdue.length > 3 && (
              <span>+{overdue.length - 3} más</span>
            )}
          </div>
        </div>
      )}

      {view === "AGENDA" ? (
        <div className={styles.agendaView}>
          {agendaEntries.length > 0 ? (
            agendaEntries.slice(0, 80).map((entry) => {
              const date = shortDateParts(entry.date);
              const overdueEntry = entry.date < today;
              const todayEntry = entry.date === today;

              return (
                <button
                  className={`${styles.agendaRow} ${
                    overdueEntry ? styles.agendaRowOverdue : ""
                  }`}
                  key={entry.id}
                  onClick={() => goToEntry(entry)}
                  type="button"
                >
                  <span className={styles.agendaDate} title={date.full}>
                    <strong>{date.day}</strong>
                    <small>{date.month}</small>
                  </span>
                  <span className={styles.agendaRowMain}>
                    <small>{entryTypeLabel(entry.kind)} · {entry.company}</small>
                    <strong>{eventLabel(entry)}</strong>
                  </span>
                  <span className={styles.agendaOwner}>
                    <small>{overdueEntry ? "Vencido" : todayEntry ? "Hoy" : "Responsable"}</small>
                    <strong>{overdueEntry || todayEntry ? date.full : entry.assignedTo || "Equipo"}</strong>
                  </span>
                  <span className={styles.agendaOpen} aria-hidden="true">Abrir</span>
                </button>
              );
            })
          ) : (
            <div className={styles.agendaEmpty}>
              <strong>No hay compromisos en esta categoría</strong>
              <p>Cambia el filtro o crea una nueva gestión con fecha.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.calendarMeta}>
            <span>
              {visibleCount} hito{visibleCount === 1 ? "" : "s"} este mes
            </span>
            <span>Selecciona un hito para abrir su registro.</span>
          </div>

          <div className={styles.calendarViewport}>
            <div className={styles.weekdayRow}>
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <div className={styles.calendarGrid}>
              {days.map((day) => {
                const dayEntries = eventsByDate.get(day.key) ?? [];

                return (
                  <div
                    className={`${styles.calendarDay} ${
                      day.currentMonth ? "" : styles.calendarDayOutside
                    } ${day.key === today ? styles.calendarDayToday : ""}`}
                    key={day.key}
                  >
                    <span className={styles.dayNumber}>{day.day}</span>

                    <div className={styles.dayEvents}>
                      {dayEntries.slice(0, 3).map((entry) => (
                        <button
                          className={eventClass(entry.kind)}
                          key={entry.id}
                          onClick={() => goToEntry(entry)}
                          title={`${entry.company} · ${eventLabel(entry)} · ${entry.assignedTo || "Equipo"}`}
                          type="button"
                        >
                          <strong>{entry.company}</strong>
                          <span>{eventLabel(entry)}</span>
                        </button>
                      ))}
                      {dayEntries.length > 3 ? (
                        <small>+{dayEntries.length - 3} más</small>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
