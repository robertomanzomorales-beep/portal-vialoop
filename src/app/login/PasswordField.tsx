"use client";

import { useState } from "react";
import styles from "./login.module.css";

export default function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <label className={styles.field}>
      <span>Contraseña</span>
      <div className={styles.passwordControl}>
        <input
          autoComplete="current-password"
          minLength={12}
          name="password"
          placeholder="Ingresa tu contraseña"
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
    </label>
  );
}
