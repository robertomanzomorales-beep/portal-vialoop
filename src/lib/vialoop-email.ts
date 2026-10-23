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
        : `<p style="margin:0 0 16px;color:#312f2a;font-size:14px;line-height:1.72;">${line}</p>`,
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
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <title>${safeTitle}</title>
        <style>
          :root { color-scheme: light only; }
          @media only screen and (max-width: 640px) {
            .vialoop-shell { padding: 0 !important; }
            .vialoop-sheet { width: 100% !important; }
            .vialoop-header { padding: 27px 22px 31px !important; }
            .vialoop-content { padding: 30px 22px 36px !important; }
            .vialoop-footer { padding: 22px !important; }
            .vialoop-title { font-size: 29px !important; line-height: 1.08 !important; }
            .vialoop-reference { display: block !important; padding: 17px 0 0 !important; text-align: left !important; }
            .quote-meta-cell {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              padding: 14px 0 !important;
              border-left: 0 !important;
              border-top: 1px solid #c8c1b5 !important;
            }
            .quote-meta-cell:first-child { border-top: 0 !important; }
            .quote-item-index,
            .quote-item-service,
            .quote-item-value {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quote-item-index { padding: 18px 0 6px !important; }
            .quote-item-service { padding: 0 0 13px !important; }
            .quote-item-value { padding: 0 0 18px !important; }
            .quote-item-value span { display: inline !important; margin-right: 7px !important; }
            .quote-total-copy,
            .quote-total-amount {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quote-total-copy { padding: 21px 22px 7px !important; }
            .quote-total-amount { padding: 0 22px 24px !important; font-size: 25px !important; }
            .quote-payment-label,
            .quote-payment-value {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quote-payment-label { padding: 12px 0 3px !important; }
            .quote-payment-value { padding: 0 0 12px !important; border-top: 0 !important; }
            .quote-cta { display: block !important; width: auto !important; text-align: center !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#e9e4da;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#151411;-webkit-font-smoothing:antialiased;">
        ${
          preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preheader)}</div>`
            : ""
        }
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#e9e4da;">
          <tr>
            <td class="vialoop-shell" align="center" style="padding:42px 14px;">
              <table class="vialoop-sheet" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:700px;border-collapse:collapse;background:#f7f3e9;">
                <tr>
                  <td style="height:6px;background:#df4825;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td class="vialoop-header" style="padding:32px 44px 39px;background:#151411;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td valign="top">
                          <div style="color:#f7f3e9;font-size:20px;font-weight:850;letter-spacing:-.8px;line-height:1;">VIALOOP</div>
                          <div style="margin-top:7px;color:#aaa397;font-size:8px;font-weight:700;letter-spacing:1.35px;text-transform:uppercase;">Studio SpA / Diseño y tecnología</div>
                        </td>
                        ${
                          reference
                            ? `<td class="vialoop-reference" align="right" valign="top" style="padding-left:22px;color:#f7f3e9;font-size:10px;font-weight:750;letter-spacing:.04em;white-space:nowrap;">${escapeEmailHtml(reference)}</td>`
                            : ""
                        }
                      </tr>
                    </table>
                    <div style="width:38px;height:4px;margin-top:35px;background:#df4825;font-size:0;line-height:0;">&nbsp;</div>
                    <div style="margin-top:17px;color:#df5a38;font-size:8px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</div>
                    <h1 class="vialoop-title" style="max-width:590px;margin:10px 0 0;color:#f7f3e9;font-size:36px;font-weight:760;letter-spacing:-1.5px;line-height:1.08;">${safeTitle}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-content" style="padding:36px 44px 46px;background:#f7f3e9;font-size:14px;line-height:1.7;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-footer" style="padding:24px 44px 27px;border-top:1px solid #302e29;background:#151411;color:#aaa397;font-size:10.5px;line-height:1.7;">
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
    [/#(?:111827|0b2b50|172033|17304f|101828|18212f)/gi, "#151411"],
    [/#(?:175cd3|2563eb|1d4ed8|0d3f73)/gi, "#df4825"],
    [/#(?:b2ccff|8bc4ff|cbd5e1)/gi, "#c8c1b5"],
    [/#(?:f2f4f7|f3f5f8|eef3f8|f5f8ff)/gi, "#eee8dc"],
    [/#(?:f8fafc|f9fafb|f4f7fa|fbfbf9)/gi, "#f7f3e9"],
    [/#(?:e3e7ed|e3e7ee|e4e7ec|d8e2ee|e4e8ef|d8d8d4)/gi, "#c8c1b5"],
    [/#(?:667085|6b7f96|8a93a2|77777a)/gi, "#736e65"],
    [/#(?:344054|405873|475467|5f5f62)/gi, "#4f4b44"],
    [/border-radius:\s*[^;\"]+;?/gi, "border-radius:0;"],
    [/box-shadow:\s*[^;\"]+;?/gi, "box-shadow:none;"],
  ];

  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    html,
  );
}
