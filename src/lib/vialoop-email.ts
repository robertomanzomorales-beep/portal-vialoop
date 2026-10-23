type VialoopEmailLayoutInput = {
  eyebrow: string;
  title: string;
  content: string;
  preheader?: string;
  reference?: string;
  footer?: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function plainTextEmailContent(text: string) {
  return escapeEmailHtml(text)
    .split(/\r?\n/)
    .map((line) =>
      line.trim().length === 0
        ? '<div style="height:8px;line-height:8px;">&nbsp;</div>'
        : `<p style="margin:0 0 16px;color:#2c2c2e;font-size:14px;line-height:1.7;">${line}</p>`,
    )
    .join("");
}

export function buildVialoopEmailLayout({
  eyebrow,
  title,
  content,
  preheader,
  reference,
  footer,
}: VialoopEmailLayoutInput) {
  const safeTitle = escapeEmailHtml(title);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#1d1d1f;">
        ${
          preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preheader)}</div>`
            : ""
        }
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#f5f5f7;">
          <tr>
            <td align="center" style="padding:34px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #dedee3;border-radius:18px;background:#ffffff;box-shadow:0 12px 36px rgba(0,0,0,.06);">
                <tr>
                  <td style="height:5px;background:#0a0a0a;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 32px 24px;border-bottom:1px solid #ececf0;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td valign="middle">
                          <div style="color:#0a0a0a;font-size:21px;font-weight:800;letter-spacing:-.7px;line-height:1;">Vialoop</div>
                          <div style="margin-top:6px;color:#8e8e93;font-size:9px;font-weight:700;letter-spacing:1.35px;text-transform:uppercase;">Studio SpA · Soluciones digitales</div>
                        </td>
                        ${
                          reference
                            ? `<td align="right" valign="middle" style="padding-left:18px;color:#636366;font-size:11px;font-weight:700;letter-spacing:.04em;">${escapeEmailHtml(reference)}</td>`
                            : ""
                        }
                      </tr>
                    </table>
                    <div style="margin-top:28px;color:#8e8e93;font-size:10px;font-weight:800;letter-spacing:1.45px;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</div>
                    <h1 style="margin:8px 0 0;color:#1d1d1f;font-size:27px;font-weight:750;letter-spacing:-.8px;line-height:1.16;">${safeTitle}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 32px 34px;font-size:14px;line-height:1.65;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 32px 24px;border-top:1px solid #ececf0;background:#fafafa;color:#8e8e93;font-size:11px;line-height:1.7;">
                    ${
                      footer ??
                      "Vialoop Studio SpA · vialoop.cl<br />Este mensaje fue generado desde el portal administrativo de Vialoop."
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function normalizeVialoopEmailHtml(html: string) {
  const replacements: Array<[RegExp, string]> = [
    [/#(?:111827|0b2b50|172033|17304f)/gi, "#1d1d1f"],
    [/#(?:175cd3|2563eb|1d4ed8|0d3f73)/gi, "#0a0a0a"],
    [/#(?:b2ccff|8bc4ff|cbd5e1)/gi, "#d1d1d6"],
    [/#(?:f2f4f7|f3f5f8|eef3f8)/gi, "#f5f5f7"],
    [/#(?:f8fafc|f9fafb|f4f7fa)/gi, "#fafafa"],
    [/#(?:e3e7ed|e3e7ee|e4e7ec|d8e2ee|e4e8ef)/gi, "#dedee3"],
    [/#(?:667085|6b7f96|8a93a2)/gi, "#8e8e93"],
    [/#(?:344054|405873|475467)/gi, "#636366"],
    [/#(?:101828|18212f)/gi, "#1d1d1f"],
  ];

  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    html,
  );
}
