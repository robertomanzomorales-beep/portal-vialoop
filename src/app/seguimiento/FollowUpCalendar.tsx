"use client";

import {
  useMemo,
  useState,
} from "react";
import styles from "./seguimiento.module.css";

export type FollowUpCalendarEntry = {
  id: string;
  prospectId: string;
  kind: "FOLLOW_UP" | "QUOTATION_DEADLINE";
  company: string;
  date: string;
  status: string;
  assignedTo: string;
  quotationNumber: string;
};

const weekdays = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
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

function goToProspect(prospectId: string) {
  document
    .getElementById(`prospect-${prospectId}`)
    ?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
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

  const days = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth],
  );
  const eventsByDate = useMemo(() => {
    const grouped = new Map<
      string,
      FollowUpCalendarEntry[]
    >();

    entries.forEach((entry) => {
      const current =
        grouped.get(entry.date) ?? [];
      current.push(entry);
      grouped.set(entry.date, current);
    });

    return grouped;
  }, [entries]);
  const overdue = entries
    .filter((entry) => entry.date < today)
    .sort((first, second) =>
      first.date.localeCompare(second.date),
    );
  const visibleCount = entries.filter(
    (entry) =>
      entry.date.startsWith(visibleMonth),
  ).length;

  return (
    <section className={styles.calendarPanel}>
      <div className={styles.calendarHeader}>
        <div>
          <span className={styles.eyebrow}>
            Agenda comercial
          </span>
          <h2>Calendario de seguimientos</h2>
          <p>
            Revisa próximos contactos y vencimientos de cotizaciones sin recorrer todo el pipeline.
          </p>
        </div>

        <div className={styles.calendarNavigation}>
          <button
            aria-label="Mes anterior"
            onClick={() =>
              setVisibleMonth((month) =>
                moveMonth(month, -1),
              )
            }
            type="button"
          >
            ←
          </button>
          <strong>{monthLabel(visibleMonth)}</strong>
          <button
            aria-label="Mes siguiente"
            onClick={() =>
              setVisibleMonth((month) =>
                moveMonth(month, 1),
              )
            }
            type="button"
          >
            →
          </button>
          <button
            className={styles.todayButton}
            onClick={() =>
              setVisibleMonth(currentMonth)
            }
            type="button"
          >
            Hoy
          </button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className={styles.overdueStrip}>
          <div>
            <strong>
              {overdue.length} hito
              {overdue.length === 1 ? "" : "s"} comercial
              {overdue.length === 1 ? "" : "es"} vencido
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
                  goToProspect(entry.prospectId)
                }
                type="button"
              >
                {entry.company}
              </button>
            ))}
            {overdue.length > 3 && (
              <span>+{overdue.length - 3} más</span>
            )}
          </div>
        </div>
      )}

      <div className={styles.calendarMeta}>
        <span>
          {visibleCount} hito
          {visibleCount === 1 ? "" : "s"} este mes
        </span>
        <span>
          Selecciona una oportunidad para verla en el listado.
        </span>
      </div>

      <div className={styles.calendarViewport}>
        <div className={styles.weekdayRow}>
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className={styles.calendarGrid}>
          {days.map((day) => {
            const dayEntries =
              eventsByDate.get(day.key) ?? [];

            return (
              <div
                className={`${styles.calendarDay} ${
                  day.currentMonth
                    ? ""
                    : styles.calendarDayOutside
                } ${
                  day.key === today
                    ? styles.calendarDayToday
                    : ""
                }`}
                key={day.key}
              >
                <span className={styles.dayNumber}>
                  {day.day}
                </span>

                <div className={styles.dayEvents}>
                  {dayEntries
                    .slice(0, 3)
                    .map((entry) => (
                      <button
                        className={
                          entry.kind ===
                          "QUOTATION_DEADLINE"
                            ? styles.calendarDeadlineEvent
                            : undefined
                        }
                        key={entry.id}
                        onClick={() =>
                          goToProspect(
                            entry.prospectId,
                          )
                        }
                        title={`${entry.company} · ${entry.assignedTo || "Equipo"}`}
                        type="button"
                      >
                        <strong>{entry.company}</strong>
                        <span>
                          {entry.kind ===
                          "QUOTATION_DEADLINE"
                            ? `Vence ${entry.quotationNumber}`
                            : entry.quotationNumber ||
                              entry.status}
                        </span>
                      </button>
                    ))}
                  {dayEntries.length > 3 && (
                    <small>
                      +{dayEntries.length - 3} más
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
