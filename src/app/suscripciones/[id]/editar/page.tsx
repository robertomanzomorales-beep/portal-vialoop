import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSubscription } from "../../actions";
import CreateRenewalModal from "../../CreateRenewalModal";
import SubscriptionForm from "../../SubscriptionForm";
import styles from "../../suscripciones.module.css";

type EditSubscriptionPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    resultado?: string;
    error?: string;
    renovacion?: string;
  }>;
};

function formatCurrency(
  value: unknown,
) {
  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    },
  ).format(Number(value));
}

function formatDateInput(
  date: Date | null | undefined,
) {
  if (!date) {
    return "";
  }

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

function formatDate(
  date: Date | null | undefined,
) {
  if (!date) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat(
    "es-CL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Santiago",
    },
  ).format(date);
}

function getStatusLabel(
  status: string,
) {
  const labels: Record<string, string> = {
    ACTIVE: "Activa",
    PENDING: "Pendiente",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
    EXPIRED: "Vencida",
  };

  return labels[status] ?? status;
}

function getRenewalStatusLabel(
  status: string,
) {
  const labels: Record<string, string> = {
    UPCOMING: "Próxima",
    NOTIFIED: "Notificada",
    PAID: "Pagada",
    RENEWED: "Renovada",
    EXPIRED: "Vencida",
    CANCELLED: "Cancelada",
  };

  return labels[status] ?? status;
}

function getCycleLabel(
  cycle: string,
) {
  const labels: Record<string, string> = {
    MONTHLY: "Mensual",
    SEMIANNUAL: "Semestral",
    ANNUAL: "Anual",
  };

  return labels[cycle] ?? cycle;
}

export default async function EditSubscriptionPage({
  params,
  searchParams,
}: EditSubscriptionPageProps) {
  const { id } = await params;

  const resolvedSearchParams =
    await searchParams;

  const subscription =
    await prisma.subscription.findUnique({
      where: {
        id,
      },
      include: {
        client: true,
        project: true,
        plan: true,
        renewals: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            payments: true,
            renewals: true,
          },
        },
      },
    });

  if (!subscription) {
    notFound();
  }

  const [clients, plans] =
    await Promise.all([
      prisma.client.findMany({
        where: {
          OR: [
            {
              status: "ACTIVE",
            },
            {
              id: subscription.clientId,
            },
          ],
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
          OR: [
            {
              active: true,
            },
            {
              id: subscription.planId,
            },
          ],
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

  const action =
    updateSubscription.bind(
      null,
      subscription.id,
    );

  const latestRenewal =
    subscription.renewals[0] ??
    null;

  const canCreateRenewal =
    subscription.status !==
      "CANCELLED" &&
    subscription.status !==
      "EXPIRED";

  const projectReference =
    subscription.project?.domain ??
    subscription.project?.name ??
    "Suscripción general del cliente";

  return (
    <main className={styles.page}>
      <header
        className={styles.header}
      >
        <div>
          <span
            className={styles.eyebrow}
          >
            Edición de suscripción
          </span>

          <h1>
            {
              subscription.client
                .businessName
            }
          </h1>

          <p>
            Actualiza el plan, proyecto,
            condiciones comerciales, fechas
            y estado de la suscripción.
          </p>
        </div>

        <div
          className={
            styles.headerActions
          }
        >
          <Link
            className={
              styles.secondaryButton
            }
            href="/suscripciones"
          >
            Volver a suscripciones
          </Link>

          <Link
            className={
              styles.secondaryButton
            }
            href={`/clientes/${subscription.clientId}`}
          >
            Ver cliente
          </Link>
        </div>
      </header>

      {resolvedSearchParams.resultado ===
        "creada" && (
        <div
          className={
            styles.successMessage
          }
        >
          La suscripción fue creada
          correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "actualizada" && (
        <div
          className={
            styles.successMessage
          }
        >
          La suscripción fue actualizada
          correctamente.
        </div>
      )}

      {resolvedSearchParams.resultado ===
        "renovacion-creada" && (
        <div
          className={
            styles.successMessage
          }
        >
          La renovación fue creada
          correctamente. No se generó ningún
          cobro ni pago.
        </div>
      )}

      {resolvedSearchParams.error ===
        "duplicada" && (
        <div
          className={
            styles.warningMessage
          }
        >
          Ya existe otra suscripción activa,
          pendiente o suspendida para esa
          combinación de cliente, proyecto y
          plan.
        </div>
      )}

      {resolvedSearchParams.error ===
        "renovacion-duplicada" && (
        <div
          className={
            styles.warningMessage
          }
        >
          Ya existe una renovación no
          cancelada para esta suscripción en
          la fecha seleccionada. No se creó
          un registro duplicado.
        </div>
      )}

      <section
        className={
          styles.detailBanner
        }
      >
        <div>
          <span>Plan actual</span>

          <strong>
            {subscription.plan.name}
          </strong>
        </div>

        <div>
          <span>
            Precio acordado
          </span>

          <strong
            className={
              styles.bannerPrice
            }
          >
            {formatCurrency(
              subscription.agreedPrice,
            )}
          </strong>
        </div>

        <div>
          <span>Ciclo actual</span>

          <strong>
            {getCycleLabel(
              subscription.billingCycle,
            )}
          </strong>
        </div>

        <div>
          <span>Estado actual</span>

          <strong>
            {getStatusLabel(
              subscription.status,
            )}
          </strong>
        </div>
      </section>

      <section
        className={
          styles.renewalActionPanel
        }
      >
        <div
          className={
            styles.renewalActionInfo
          }
        >
          <span
            className={
              styles.panelEyebrow
            }
          >
            Renovación vinculada
          </span>

          <h2>
            Crear renovación desde esta
            suscripción
          </h2>

          <p>
            Utiliza el precio acordado y la
            próxima fecha de renovación como
            valores iniciales. Podrás
            revisarlos antes de confirmar.
          </p>

          <div
            className={
              styles.renewalMeta
            }
          >
            <span>
              Renovaciones registradas:{" "}
              <strong>
                {
                  subscription._count
                    .renewals
                }
              </strong>
            </span>

            {latestRenewal && (
              <>
                <span>
                  Último vencimiento:{" "}
                  <strong>
                    {formatDate(
                      latestRenewal.dueDate,
                    )}
                  </strong>
                </span>

                <span>
                  Estado:{" "}
                  <strong>
                    {getRenewalStatusLabel(
                      latestRenewal.status,
                    )}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>

        <CreateRenewalModal
          billingCycle={getCycleLabel(
            subscription.billingCycle,
          )}
          clientName={
            subscription.client
              .businessName
          }
          defaultDueDate={formatDateInput(
            subscription.renewsAt,
          )}
          defaultNetAmount={Math.round(
            Number(
              subscription.agreedPrice,
            ),
          )}
          disabled={
            !canCreateRenewal
          }
          disabledReason={
            !canCreateRenewal
              ? "La suscripción está cancelada o vencida."
              : undefined
          }
          planName={
            subscription.plan.name
          }
          projectName={
            projectReference
          }
          subscriptionId={
            subscription.id
          }
        />
      </section>

      <form
        action={action}
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
              Modifica el cliente, proyecto,
              plan, precio, ciclo y fechas.
            </p>
          </div>

          <SubscriptionForm
            clients={
              serializedClients
            }
            initialValues={{
              clientId:
                subscription.clientId,
              projectId:
                subscription.projectId ??
                "",
              planId:
                subscription.planId,
              status:
                subscription.status,
              billingCycle:
                subscription.billingCycle,
              agreedPrice: String(
                Math.round(
                  Number(
                    subscription.agreedPrice,
                  ),
                ),
              ),
              requestsUsed: String(
                subscription.requestsUsed,
              ),
              startsAt:
                formatDateInput(
                  subscription.startsAt,
                ),
              renewsAt:
                formatDateInput(
                  subscription.renewsAt,
                ),
              endsAt:
                formatDateInput(
                  subscription.endsAt,
                ),
              notes:
                subscription.notes ?? "",
            }}
            mode="edit"
            plans={serializedPlans}
          />
        </section>

        <section
          className={
            styles.safetyNotice
          }
        >
          <strong>
            Registros relacionados
          </strong>

          <p>
            Esta suscripción posee{" "}
            {
              subscription._count
                .renewals
            }{" "}
            renovaciones y{" "}
            {
              subscription._count
                .payments
            }{" "}
            pagos relacionados. Editarla no
            modifica esos registros
            automáticamente.
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
            type="submit"
          >
            Guardar cambios
          </button>
        </footer>
      </form>
    </main>
  );
}