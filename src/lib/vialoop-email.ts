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
        : `<p style="margin:0 0 16px;color:#475467;font-size:14px;line-height:1.7;">${line}</p>`,
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
            .vialoop-shell { padding: 12px 8px !important; }
            .vialoop-sheet { border-radius: 12px !important; }
            .vialoop-header { padding: 23px 22px 25px !important; }
            .vialoop-content { padding: 25px 22px 31px !important; }
            .vialoop-footer { padding: 19px 22px 23px !important; }
            .vialoop-title { font-size: 22px !important; line-height: 1.18 !important; }
            .vialoop-reference { display: block !important; padding: 13px 0 0 !important; text-align: left !important; }
            .quote-meta-cell,
            .quote-item-copy,
            .quote-item-value,
            .quote-total-copy,
            .quote-total-value,
            .quote-payment-label,
            .quote-payment-value {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quote-meta-cell { border-left: 0 !important; border-top: 1px solid #e4e7ec !important; }
            .quote-meta-cell:first-child { border-top: 0 !important; }
            .quote-item-copy { padding: 15px 16px 7px !important; }
            .quote-item-value { padding: 0 16px 15px !important; }
            .quote-total-copy { padding: 18px 18px 4px !important; }
            .quote-total-value { padding: 0 18px 20px !important; }
            .quote-payment-label { padding: 10px 0 2px !important; }
            .quote-payment-value { padding: 0 0 10px !important; border-top: 0 !important; }
            .quote-cta { display: block !important; text-align: center !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#f2f4f7;font-family:Arial,Helvetica,'Segoe UI',sans-serif;color:#101828;-webkit-font-smoothing:antialiased;">
        ${
          preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preheader)}</div>`
            : ""
        }
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#f2f4f7;">
          <tr>
            <td class="vialoop-shell" align="center" style="padding:34px 14px;">
              <table class="vialoop-sheet" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:680px;overflow:hidden;border:1px solid #e4e7ec;border-radius:14px;border-collapse:separate;border-spacing:0;background:#ffffff;box-shadow:0 8px 22px rgba(16,24,40,.05);">
                <tr>
                  <td class="vialoop-header" style="padding:25px 30px 27px;background:#111827;color:#ffffff;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td valign="top">
                          <div style="color:#b2ccff;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</div>
                        </td>
                        ${
                          reference
                            ? `<td class="vialoop-reference" align="right" valign="top" style="padding-left:20px;color:#dbe7ff;font-size:11px;font-weight:700;white-space:nowrap;">${escapeEmailHtml(reference)}</td>`
                            : ""
                        }
                      </tr>
                    </table>
                    <h1 class="vialoop-title" style="margin:8px 0 0;color:#ffffff;font-size:23px;font-weight:700;letter-spacing:-.35px;line-height:1.2;">${safeTitle}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-content" style="padding:30px;background:#ffffff;color:#101828;font-size:14px;line-height:1.65;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-footer" style="padding:20px 30px 25px;border-top:1px solid #eaecf0;background:#ffffff;color:#667085;font-size:11px;line-height:1.6;">
                    ${
                      footer ??
                      "Vialoop Studio SpA · vialoop.cl<br />Este mensaje fue generado desde el Portal Vialoop."
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
    [/#(?:151411|181819|1d1d1f|2c2c2e)/gi, "#101828"],
    [/#(?:df4825|df5a38|2563eb|1d4ed8|0d3f73)/gi, "#175cd3"],
    [/#(?:aaa397|736e65|77777a|8a93a2|8e8e93)/gi, "#667085"],
    [/#(?:4f4b44|5f5a51|312f2a|302e29|636366)/gi, "#475467"],
    [/#(?:c8c1b5|d8d1c5|d8d8d4|dedee3|ececf0)/gi, "#e4e7ec"],
    [/#(?:e9e4da|eee8dc|edf0f4|efefec)/gi, "#f2f4f7"],
    [/#(?:f7f3e9|fbfbf9)/gi, "#ffffff"],
  ];

  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    html,
  );
}
