import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createSubscription } from "../actions";
import SubscriptionForm from "../SubscriptionForm";
import styles from "../suscripciones.module.css";

type NewSubscriptionPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function formatDateInput(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

export default async function NewSubscriptionPage({
  searchParams,
}: NewSubscriptionPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const [clients, plans] =
    await Promise.all([
      prisma.client.findMany({
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          businessName: "asc",
        },
        include: {
          projects: {
            orderBy: {
              name: "asc",
            },
            select: {
              id: true,
              name: true,
              domain: true,
            },
          },
        },
      }),

      prisma.plan.findMany({
        where: {
          active: true,
        },
        orderBy: {
          monthlyPrice: "asc",
        },
      }),
    ]);

  const serializedClients =
    clients.map((client) => ({
      id: client.id,
      businessName:
        client.businessName,
      projects:
        client.projects.map(
          (project) => ({
            id: project.id,
            name: project.name,
            domain: project.domain,
          }),
        ),
    }));

  const serializedPlans =
    plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthlyPrice: Number(
        plan.monthlyPrice,
      ),
      active: plan.active,
    }));

  const canCreate =
    clients.length > 0 &&
    plans.length > 0;

  return (
    <main className={styles.page}>
      <header
        className={styles.header}
      >
        <div>
          <span
            className={styles.eyebrow}
          >
            Nuevo servicio recurrente
          </span>

          <h1>
            Crear suscripción
          </h1>

          <p>
            Vincula un cliente con un plan,
            proyecto, ciclo de cobro y precio
            comercial acordado.
          </p>
        </div>

        <Link
          className={
            styles.secondaryButton
          }
          href="/suscripciones"
        >
          Volver a suscripciones
        </Link>
      </header>

      {resolvedSearchParams.error ===
        "duplicada" && (
        <div
          className={
            styles.warningMessage
          }
        >
          Ya existe una suscripción activa,
          pendiente o suspendida para la misma
          combinación de cliente, proyecto y
          plan.
        </div>
      )}

      {!canCreate && (
        <div
          className={
            styles.warningMessage
          }
        >
          Para crear una suscripción necesitas
          al menos un cliente activo y un plan
          activo.
        </div>
      )}

      <form
        action={createSubscription}
        className={styles.formPanel}
      >
        <section
          className={
            styles.formSection
          }
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <h2>
              Información de la suscripción
            </h2>

            <p>
              Define el cliente, plan,
              condiciones comerciales y fechas
              de vigencia.
            </p>
          </div>

          <SubscriptionForm
            clients={
              serializedClients
            }
            initialValues={{
              clientId: "",
              projectId: "",
              planId: "",
              status: "ACTIVE",
              billingCycle:
                "MONTHLY",
              agreedPrice: "",
              requestsUsed: "0",
              startsAt:
                formatDateInput(
                  new Date(),
                ),
              renewsAt: "",
              endsAt: "",
              notes: "",
            }}
            mode="create"
            plans={serializedPlans}
          />
        </section>

        <section
          className={
            styles.safetyNotice
          }
        >
          <strong>
            Sin movimiento financiero
          </strong>

          <p>
            Guardar esta suscripción no genera
            cobros, pagos ni renovaciones.
            Solo crea el registro comercial.
          </p>
        </section>

        <footer
          className={
            styles.formFooter
          }
        >
          <Link
            className={
              styles.secondaryButton
            }
            href="/suscripciones"
          >
            Cancelar
          </Link>

          <button
            className={
              styles.primaryButton
            }
            disabled={!canCreate}
            type="submit"
          >
            Guardar suscripción
          </button>
        </footer>
      </form>
    </main>
  );
}