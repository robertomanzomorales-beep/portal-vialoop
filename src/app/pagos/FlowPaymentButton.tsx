"use client";

import {
  useFormStatus,
} from "react-dom";

import {
  createFlowOrderForPayment,
} from "./flow-actions";

import styles from "./pagos.module.css";

type FlowPaymentButtonProps = {
  paymentId: string;
};

function SubmitButton() {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      className={
        styles.primaryAction
      }
      disabled={
        pending
      }
      type="submit"
    >
      {pending
        ? "Generando..."
        : "Generar Flow"}
    </button>
  );
}

export default function FlowPaymentButton({
  paymentId,
}: FlowPaymentButtonProps) {
  const action =
    createFlowOrderForPayment.bind(
      null,
      paymentId,
    );

  return (
    <form
      action={action}
    >
      <SubmitButton />
    </form>
  );
}