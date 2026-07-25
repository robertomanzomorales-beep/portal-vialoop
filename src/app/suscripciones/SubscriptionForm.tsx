"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import styles from "./suscripciones.module.css";

type ProjectOption = {
  id: string;
  name: string;
  domain: string | null;
};

type ClientOption = {
  id: string;
  businessName: string;
  projects: ProjectOption[];
};

type PlanOption = {
  id: string;
  name: string;
  monthlyPrice: number;
  active: boolean;
};

type InitialValues = {
  clientId: string;
  projectId: string;
  planId: string;
  status: string;
  billingCycle: string;
  agreedPrice: string;
  requestsUsed: string;
  startsAt: string;
  renewsAt: string;
  endsAt: string;
  notes: string;
};

type SubscriptionFormProps = {
  clients: ClientOption[];
  plans: PlanOption[];
  initialValues: InitialValues;
  mode: "create" | "edit";
};

function getCycleFactor(
  billingCycle: string,
) {
  if (billingCycle === "SEMIANNUAL") {
    return 6;
  }

  if (billingCycle === "ANNUAL") {
    return 12;
  }

  return 1;
}

export default function SubscriptionForm({
  clients,
  plans,
  initialValues,
  mode,
}: SubscriptionFormProps) {
  const [
    selectedClientId,
    setSelectedClientId,
  ] = useState(
    initialValues.clientId,
  );

  const [
    selectedProjectId,
    setSelectedProjectId,
  ] = useState(
    initialValues.projectId,
  );

  const [
    selectedPlanId,
    setSelectedPlanId,
  ] = useState(
    initialValues.planId,
  );

  const [
    billingCycle,
    setBillingCycle,
  ] = useState(
    initialValues.billingCycle,
  );

  const [
    agreedPrice,
    setAgreedPrice,
  ] = useState(
    initialValues.agreedPrice,
  );

  const [
    priceWasEdited,
    setPriceWasEdited,
  ] = useState(mode === "edit");

  const selectedClient = useMemo(
    () =>
      clients.find(
        (client) =>
          client.id ===
          selectedClientId,
      ) ?? null,
    [clients, selectedClientId],
  );

  const availableProjects =
    selectedClient?.projects ?? [];

  const selectedPlan = useMemo(
    () =>
      plans.find(
        (plan) =>
          plan.id === selectedPlanId,
      ) ?? null,
    [plans, selectedPlanId],
  );

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    const projectIsValid =
      availableProjects.some(
        (project) =>
          project.id ===
          selectedProjectId,
      );

    if (!projectIsValid) {
      setSelectedProjectId("");
    }
  }, [
    availableProjects,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (
      priceWasEdited ||
      !selectedPlan
    ) {
      return;
    }

    const suggestedPrice =
      Math.round(
        selectedPlan.monthlyPrice *
          getCycleFactor(
            billingCycle,
          ),
      );

    setAgreedPrice(
      String(suggestedPrice),
    );
  }, [
    selectedPlan,
    billingCycle,
    priceWasEdited,
  ]);

  return (
    <div className={styles.formGrid}>
      <label className={styles.field}>
        <span>Cliente *</span>

        <select
          name="clientId"
          onChange={(event) => {
            setSelectedClientId(
              event.target.value,
            );
          }}
          required
          value={selectedClientId}
        >
          <option disabled value="">
            Seleccionar cliente
          </option>

          {clients.map((client) => (
            <option
              key={client.id}
              value={client.id}
            >
              {client.businessName}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Proyecto asociado</span>

        <select
          disabled={!selectedClientId}
          name="projectId"
          onChange={(event) => {
            setSelectedProjectId(
              event.target.value,
            );
          }}
          value={selectedProjectId}
        >
          <option value="">
            Suscripción general del cliente
          </option>

          {availableProjects.map(
            (project) => (
              <option
                key={project.id}
                value={project.id}
              >
                {project.domain ??
                  project.name}
              </option>
            ),
          )}
        </select>

        <small>
          Solo se muestran proyectos del
          cliente seleccionado.
        </small>
      </label>

      <label className={styles.field}>
        <span>Plan *</span>

        <select
          name="planId"
          onChange={(event) => {
            setSelectedPlanId(
              event.target.value,
            );

            if (mode === "create") {
              setPriceWasEdited(false);
            }
          }}
          required
          value={selectedPlanId}
        >
          <option disabled value="">
            Seleccionar plan
          </option>

          {plans.map((plan) => (
            <option
              key={plan.id}
              value={plan.id}
            >
              {plan.name}
              {!plan.active
                ? " · Inactivo"
                : ""}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Ciclo de cobro *</span>

        <select
          name="billingCycle"
          onChange={(event) => {
            setBillingCycle(
              event.target.value,
            );

            if (mode === "create") {
              setPriceWasEdited(false);
            }
          }}
          required
          value={billingCycle}
        >
          <option value="MONTHLY">
            Mensual
          </option>

          <option value="SEMIANNUAL">
            Semestral
          </option>

          <option value="ANNUAL">
            Anual
          </option>
        </select>
      </label>

      <label className={styles.field}>
        <span>
          Precio acordado neto por ciclo *
        </span>

        <input
          inputMode="numeric"
          min="1"
          name="agreedPrice"
          onChange={(event) => {
            setAgreedPrice(
              event.target.value,
            );
            setPriceWasEdited(true);
          }}
          required
          step="1"
          type="number"
          value={agreedPrice}
        />

        <small>
          El sistema sugiere el valor del
          plan según el ciclo. Puedes
          modificarlo si existe un acuerdo
          especial.
        </small>
      </label>

      <label className={styles.field}>
        <span>Estado *</span>

        <select
          defaultValue={
            initialValues.status
          }
          name="status"
          required
        >
          <option value="ACTIVE">
            Activa
          </option>

          <option value="PENDING">
            Pendiente
          </option>

          <option value="SUSPENDED">
            Suspendida
          </option>

          <option value="CANCELLED">
            Cancelada
          </option>

          <option value="EXPIRED">
            Vencida
          </option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Fecha de inicio *</span>

        <input
          defaultValue={
            initialValues.startsAt
          }
          name="startsAt"
          required
          type="date"
        />
      </label>

      <label className={styles.field}>
        <span>Próxima renovación</span>

        <input
          defaultValue={
            initialValues.renewsAt
          }
          name="renewsAt"
          type="date"
        />

        <small>
          Esta fecha aún no genera un
          cobro ni una renovación.
        </small>
      </label>

      <label className={styles.field}>
        <span>Fecha de término</span>

        <input
          defaultValue={
            initialValues.endsAt
          }
          name="endsAt"
          type="date"
        />
      </label>

      <label className={styles.field}>
        <span>
          Solicitudes utilizadas
        </span>

        <input
          defaultValue={
            initialValues.requestsUsed
          }
          min="0"
          name="requestsUsed"
          required
          step="1"
          type="number"
        />
      </label>

      <label
        className={`${styles.field} ${styles.fullWidth}`}
      >
        <span>Notas internas</span>

        <textarea
          defaultValue={
            initialValues.notes
          }
          name="notes"
          placeholder="Condiciones comerciales, descuentos, acuerdos o antecedentes relevantes."
          rows={6}
        />
      </label>
    </div>
  );
}