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
        : `<p style="margin:0 0 16px;color:#29292b;font-size:14px;line-height:1.72;">${line}</p>`,
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
            .vialoop-shell { padding: 0 !important; }
            .vialoop-sheet { border-left: 0 !important; border-right: 0 !important; }
            .vialoop-header { padding: 25px 22px 28px !important; }
            .vialoop-content { padding: 28px 22px 34px !important; }
            .vialoop-footer { padding: 20px 22px 24px !important; }
            .vialoop-title { font-size: 29px !important; line-height: 1.08 !important; }
            .vialoop-reference { display: block !important; padding: 16px 0 0 !important; text-align: left !important; }
            .quotation-meta-cell {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              border-left: 0 !important;
              border-top: 1px solid #d8d8d4 !important;
            }
            .quotation-meta-cell:first-child { border-top: 0 !important; }
            .quotation-item-number,
            .quotation-item-service,
            .quotation-item-metric {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quotation-item-number { padding: 17px 0 5px !important; }
            .quotation-item-service { padding: 0 0 15px !important; }
            .quotation-item-metric {
              padding: 9px 0 !important;
              border-top: 1px solid #e7e7e3;
            }
            .quotation-item-metric:last-child { padding-bottom: 16px !important; }
            .quotation-total-label { font-size: 11px !important; }
            .quotation-total-value { font-size: 22px !important; }
            .quotation-payment-label,
            .quotation-payment-value {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quotation-payment-label { padding-bottom: 0 !important; }
            .quotation-payment-value { border-top: 0 !important; padding-top: 4px !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#efefec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#181819;-webkit-font-smoothing:antialiased;">
        ${
          preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preheader)}</div>`
            : ""
        }
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#efefec;">
          <tr>
            <td class="vialoop-shell" align="center" style="padding:40px 14px;">
              <table class="vialoop-sheet" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:720px;border-collapse:collapse;border:1px solid #d6d6d1;border-top:6px solid #111113;background:#ffffff;">
                <tr>
                  <td class="vialoop-header" style="padding:30px 42px 34px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td valign="top">
                          <div style="color:#111113;font-size:20px;font-weight:800;letter-spacing:-.75px;line-height:1;">Vialoop</div>
                          <div style="margin-top:7px;color:#77777a;font-size:8px;font-weight:700;letter-spacing:1.25px;text-transform:uppercase;">Studio SpA / Diseño y tecnología</div>
                        </td>
                        ${
                          reference
                            ? `<td class="vialoop-reference" align="right" valign="top" style="padding-left:22px;color:#2f2f31;font-size:11px;font-weight:750;letter-spacing:.035em;white-space:nowrap;">${escapeEmailHtml(reference)}</td>`
                            : ""
                        }
                      </tr>
                    </table>
                    <div style="margin-top:31px;padding-top:24px;border-top:1px solid #181819;color:#77777a;font-size:8px;font-weight:800;letter-spacing:1.45px;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</div>
                    <h1 class="vialoop-title" style="max-width:590px;margin:9px 0 0;color:#111113;font-size:34px;font-weight:760;letter-spacing:-1.45px;line-height:1.1;">${safeTitle}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-content" style="padding:33px 42px 42px;border-top:1px solid #d8d8d4;font-size:14px;line-height:1.7;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-footer" style="padding:22px 42px 26px;border-top:1px solid #181819;background:#f6f6f3;color:#737376;font-size:10.5px;line-height:1.7;">
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
    [/#(?:111827|0b2b50|172033|17304f)/gi, "#181819"],
    [/#(?:175cd3|2563eb|1d4ed8|0d3f73)/gi, "#111113"],
    [/#(?:b2ccff|8bc4ff|cbd5e1)/gi, "#d1d1cd"],
    [/#(?:f2f4f7|f3f5f8|eef3f8)/gi, "#f6f6f3"],
    [/#(?:f8fafc|f9fafb|f4f7fa)/gi, "#fbfbf9"],
    [/#(?:e3e7ed|e3e7ee|e4e7ec|d8e2ee|e4e8ef)/gi, "#d8d8d4"],
    [/#(?:667085|6b7f96|8a93a2)/gi, "#77777a"],
    [/#(?:344054|405873|475467)/gi, "#5f5f62"],
    [/#(?:101828|18212f)/gi, "#181819"],
    [/border-radius:\s*[^;\"]+;?/gi, "border-radius:0;"],
    [/box-shadow:\s*[^;\"]+;?/gi, "box-shadow:none;"],
  ];

  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    html,
  );
}
