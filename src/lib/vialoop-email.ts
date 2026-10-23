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
        ? '<div style="height:9px;line-height:9px;">&nbsp;</div>'
        : `<p style="margin:0 0 16px;color:#2c2c2e;font-size:14px;line-height:1.75;">${line}</p>`,
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
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>${safeTitle}</title>
        <style>
          @media only screen and (max-width: 640px) {
            .vialoop-shell { padding: 14px 6px !important; }
            .vialoop-header { padding: 24px 22px 26px !important; }
            .vialoop-content { padding: 27px 22px 30px !important; }
            .vialoop-footer { padding: 0 12px 12px !important; }
            .vialoop-title { font-size: 25px !important; }
            .quotation-item-number,
            .quotation-item-service,
            .quotation-item-metric {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quotation-item-number { padding: 15px 16px 0 !important; }
            .quotation-item-service { padding: 12px 16px 15px !important; }
            .quotation-item-metric {
              padding: 10px 16px !important;
              border-top: 1px solid #eeeeef;
            }
            .quotation-item-metric:last-child { padding-bottom: 16px !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#f2f2f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#1d1d1f;-webkit-font-smoothing:antialiased;">
        ${
          preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preheader)}</div>`
            : ""
        }
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#f2f2f4;">
          <tr>
            <td class="vialoop-shell" align="center" style="padding:38px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:700px;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #dddde2;border-radius:26px;background:#ffffff;box-shadow:0 20px 55px rgba(0,0,0,.08);">
                <tr>
                  <td style="padding:12px 12px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:20px;background:#0b0b0d;">
                      <tr>
                        <td class="vialoop-header" style="padding:28px 30px 30px;">
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                            <tr>
                              <td valign="middle">
                                <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-.9px;line-height:1;">Vialoop</div>
                                <div style="margin-top:7px;color:#a1a1a6;font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Studio SpA · Soluciones digitales</div>
                              </td>
                              ${
                                reference
                                  ? `<td align="right" valign="middle" style="padding-left:18px;"><span style="display:inline-block;padding:8px 11px;border:1px solid #38383a;border-radius:999px;background:#1c1c1e;color:#f5f5f7;font-size:10px;font-weight:700;letter-spacing:.04em;white-space:nowrap;">${escapeEmailHtml(reference)}</span></td>`
                                  : ""
                              }
                            </tr>
                          </table>
                          <div style="margin-top:31px;color:#a1a1a6;font-size:9px;font-weight:800;letter-spacing:1.55px;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</div>
                          <h1 class="vialoop-title" style="margin:8px 0 0;color:#ffffff;font-size:30px;font-weight:750;letter-spacing:-1.1px;line-height:1.15;">${safeTitle}</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-content" style="padding:32px 34px 36px;font-size:14px;line-height:1.7;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-footer" style="padding:0 12px 12px;">
                    <div style="padding:19px 22px 21px;border:1px solid #e5e5e9;border-radius:17px;background:#f7f7f8;color:#8e8e93;font-size:11px;line-height:1.7;">
                      ${
                        footer ??
                        "Vialoop Studio SpA · vialoop.cl<br />Este mensaje fue generado desde el portal administrativo de Vialoop."
                      }
                    </div>
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
    [/border-radius:\s*(?:4|6|8|10)px/gi, "border-radius:14px"],
  ];

  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    html,
  );
}
