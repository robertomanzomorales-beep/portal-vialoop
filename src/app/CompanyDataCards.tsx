"use client";

import { useState } from "react";
import styles from "./page.module.css";

const companyData = [
  "VIALOOP STUDIO SPA",
  "DESARROLLO WEB, HOSTING, PUBLICIDAD Y DISEÑO DIGITAL",
  "PROVIDENCIA 1208 OF 1603 PROVIDENCIA",
  "RUT 78.455.385-K",
];

const bankData = [
  "VIALOOP STUDIO SPA",
  "RUT 78.455.385-K",
  "Mercado Pago",
  "Cuenta Vista",
  "Número de cuenta: 1038393364",
  "rmanzo@vialoop.cl",
];

function DataCard({
  id,
  label,
  title,
  lines,
  copied,
  onCopy,
}: {
  id: string;
  label: string;
  title: string;
  lines: string[];
  copied: string | null;
  onCopy: (id: string, lines: string[]) => void;
}) {
  return (
    <article className={styles.companyDataCard}>
      <div className={styles.companyDataHeader}>
        <div>
          <span>{label}</span>
          <strong>{title}</strong>
        </div>
        <button onClick={() => onCopy(id, lines)} type="button">
          {copied === id ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className={styles.companyDataContent}>
        {lines.map((line) => <span key={line}>{line}</span>)}
      </div>
    </article>
  );
}

export default function CompanyDataCards() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, lines: string[]) => {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <section className={styles.companyDataGrid} aria-label="Datos rápidos de Vialoop">
      <DataCard
        copied={copied}
        id="company"
        label="Uso administrativo"
        lines={companyData}
        onCopy={copy}
        title="Datos de empresa"
      />
      <DataCard
        copied={copied}
        id="bank"
        label="Pagos y documentos"
        lines={bankData}
        onCopy={copy}
        title="Datos bancarios"
      />
    </section>
  );
}
