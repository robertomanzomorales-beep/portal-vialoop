import CobrosManager, {
  type ChargeListItem,
  type ChargeSaleOption,
} from "./CobrosManager";
import { prisma } from "@/lib/prisma";
import styles from "./cobros.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(value);
}

function grossFromNet(value: unknown) {
  const net = Math.round(Number(value));
  return net + Math.round(net * 0.19);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    SENT: "Enviado",
    PAID: "Pagado",
    REJECTED: "Rechazado",
    CANCELLED: "Cancelado",
    ERROR: "Requiere revisión",
  };

  return labels[status] ?? status;
}

export default async function ChargesPage() {
  const [sales, charges] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: "ACTIVE",
      },
      orderBy: [
        {
          saleDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      include: {
        client: true,
        payments: {
          select: {
            amount: true,
          },
        },
      },
    }),
    prisma.manualCharge.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      include: {
        sale: {
          include: {
            client: true,
          },
        },
        flowOrders: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    }),
  ]);

  const saleOptions: ChargeSaleOption[] = sales
    .map((sale) => {
      const total = grossFromNet(sale.netAmount);
      const paid = sale.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      const balance = Math.max(total - paid, 0);

      return {
        id: sale.id,
        number: sale.number,
        clientName: sale.client.tradeName || sale.client.businessName,
        contactName: sale.client.mainContactName ?? "",
        email: sale.client.email ?? "",
        service: sale.service,
        balance,
        formattedBalance: currency(balance),
      };
    })
    .filter((sale) => sale.balance > 0);

  const chargeItems: ChargeListItem[] = charges.map((charge) => {
    const activeFlowOrder = charge.flowOrders.find(
      (order) => order.status === "PENDING" && order.paymentUrl,
    );

    return {
      id: charge.id,
      number: charge.number,
      saleNumber: charge.sale.number,
      clientName:
        charge.sale.client.tradeName || charge.sale.client.businessName,
      concept: charge.concept,
      amount: currency(Number(charge.amount)),
      recipientEmail: charge.recipientEmail,
      method:
        charge.method === "FLOW" ? "FLOW" : "BANK_TRANSFER",
      methodLabel:
        charge.method === "FLOW" ? "Flow" : "Transferencia",
      status: charge.status,
      statusLabel: statusLabel(charge.status),
      emailStatus: charge.emailStatus,
      dueDate: date(charge.dueDate),
      createdAt: date(charge.createdAt),
      paymentUrl: activeFlowOrder?.paymentUrl ?? "",
      lastError: charge.lastError ?? "",
    };
  });

  const openCharges = charges.filter((charge) =>
    ["PENDING", "SENT", "ERROR"].includes(charge.status),
  );
  const openAmount = openCharges.reduce(
    (sum, charge) => sum + Number(charge.amount),
    0,
  );
  const paidCharges = charges.filter((charge) => charge.status === "PAID");
  const paidAmount = paidCharges.reduce(
    (sum, charge) => sum + Number(charge.amount),
    0,
  );

  return (
    <main className={styles.content}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Cuentas por cobrar</span>
          <h1>Cobros</h1>
          <p>
            Solicitudes manuales para saldos de sitios web, sistemas, diseño y
            otros servicios vendidos.
          </p>
        </div>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>Cobros abiertos</span>
          <strong>{openCharges.length}</strong>
          <small>{currency(openAmount)} por recibir</small>
        </article>
        <article>
          <span>Cobros pagados</span>
          <strong>{paidCharges.length}</strong>
          <small>{currency(paidAmount)} confirmado</small>
        </article>
        <article>
          <span>Ventas disponibles</span>
          <strong>{saleOptions.length}</strong>
          <small>Ventas activas con saldo pendiente</small>
        </article>
      </section>

      <section className={styles.listPanel}>
        <CobrosManager charges={chargeItems} sales={saleOptions} />
      </section>
    </main>
  );
}
