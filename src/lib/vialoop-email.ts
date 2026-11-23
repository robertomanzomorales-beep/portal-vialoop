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
            .vialoop-shell { padding: 7px 5px !important; }
            .vialoop-sheet { border-radius: 8px !important; }
            .vialoop-header { padding: 17px 16px 18px !important; }
            .vialoop-content { padding: 19px 16px 21px !important; }
            .vialoop-footer { padding: 13px 16px 16px !important; }
            .vialoop-title { font-size: 19px !important; line-height: 1.22 !important; }
            .vialoop-reference { font-size: 9px !important; }
            .quote-meta-cell,
            .quote-item-copy,
            .quote-item-value,
            .quote-total-copy,
            .quote-total-value,
            .quote-payment-label,
            .quote-payment-value,
            .quote-action-copy,
            .quote-action-value,
            .quote-flow-copy,
            .quote-flow-value,
            .welcome-material-cell {
              display: block !important;
              box-sizing: border-box !important;
              width: 100% !important;
              text-align: left !important;
            }
            .quote-meta-cell { border-left: 0 !important; border-top: 1px solid #dfe6ee !important; }
            .quote-meta-cell:first-child { border-top: 0 !important; }
            .quote-item-copy { padding: 12px 13px 5px !important; }
            .quote-item-value { padding: 0 13px 12px !important; }
            .quote-total-copy { padding: 13px 14px 3px !important; }
            .quote-total-value { padding: 0 14px 15px !important; }
            .quote-payment-label { padding: 7px 0 1px !important; }
            .quote-payment-value { padding: 0 0 7px !important; border-top: 0 !important; }
            .quote-action-copy { padding: 12px 0 5px !important; }
            .quote-action-value { padding: 0 0 12px !important; }
            .quote-flow-copy { padding: 12px 0 5px !important; }
            .quote-flow-value { padding: 0 0 12px !important; text-align: left !important; }
            .welcome-material-cell { border-left: 1px solid #dfe6ee !important; }
            .welcome-material-cell + .welcome-material-cell { border-top: 0 !important; }
            .quote-cta { display: block !important; text-align: center !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,'Segoe UI',sans-serif;color:#172033;-webkit-font-smoothing:antialiased;">
        ${
          preheader
            ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(preheader)}</div>`
            : ""
        }
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;background:#eef2f6;">
          <tr>
            <td class="vialoop-shell" align="center" style="padding:16px 10px;">
              <table class="vialoop-sheet" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:620px;overflow:hidden;border:1px solid #d9e1eb;border-radius:9px;border-collapse:separate;border-spacing:0;background:#ffffff;box-shadow:0 6px 20px rgba(20,45,78,.06);">
                <tr>
                  <td style="height:3px;background:#2f6fed;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td class="vialoop-header" style="padding:18px 22px 20px;background:#10213a;color:#ffffff;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td valign="top">
                          <div style="color:#ffffff;font-size:12px;font-weight:800;letter-spacing:.13em;line-height:1;text-transform:uppercase;">VIALOOP</div>
                        </td>
                        ${
                          reference
                            ? `<td class="vialoop-reference" align="right" valign="top" style="padding-left:18px;color:#d6e4ff;font-size:10px;font-weight:700;white-space:nowrap;">${escapeEmailHtml(reference)}</td>`
                            : ""
                        }
                      </tr>
                    </table>
                    <div style="margin-top:15px;color:#9fc0ff;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">${escapeEmailHtml(eyebrow)}</div>
                    <h1 class="vialoop-title" style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:750;letter-spacing:-.25px;line-height:1.22;">${safeTitle}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-content" style="padding:20px 22px 22px;background:#ffffff;color:#172033;font-size:13px;line-height:1.6;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td class="vialoop-footer" style="padding:13px 22px 16px;border-top:1px solid #e5eaf0;background:#f8fafc;color:#64748b;font-size:10.5px;line-height:1.55;">
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
