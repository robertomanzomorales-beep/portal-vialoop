import {
  createHmac,
} from "node:crypto";

type FlowParameterValue =
  | string
  | number;

type FlowParameters = Record<
  string,
  FlowParameterValue
>;

type CreateFlowPaymentInput = {
  commerceOrder: string;
  subject: string;
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
  optional?: Record<
    string,
    unknown
  >;
};

type CreateFlowPaymentResponse = {
  url: string;
  token: string;
  flowOrder: number;
};

export type FlowPaymentStatusResponse = {
  flowOrder: number;
  commerceOrder: string;
  requestDate: string;
  status: 1 | 2 | 3 | 4;
  subject: string;
  currency: string;
  amount: number;
  payer: string;
  optional:
    | string
    | Record<string, unknown>
    | null;
  pending_info?:
    | Record<string, unknown>
    | null;
  paymentData?:
    | {
        date?: string;
        media?: string;
        conversionDate?: string;
        conversionRate?: number;
        amount?: number;
        currency?: string;
        fee?: number;
        balance?: number;
        transferDate?: string;
        [key: string]: unknown;
      }
    | null;
  merchantId?: string | null;
  [key: string]: unknown;
};

function getRequiredEnvironmentVariable(
  name: string,
) {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta configurar la variable ${name}.`,
    );
  }

  return value;
}

function getFlowConfiguration() {
  return {
    apiUrl:
      getRequiredEnvironmentVariable(
        "FLOW_API_URL",
      ).replace(/\/+$/, ""),

    apiKey:
      getRequiredEnvironmentVariable(
        "FLOW_API_KEY",
      ),

    secretKey:
      getRequiredEnvironmentVariable(
        "FLOW_SECRET_KEY",
      ),
  };
}

function createFlowSignature(
  parameters: FlowParameters,
  secretKey: string,
) {
  const contentToSign =
    Object.keys(parameters)
      .sort()
      .map(
        (key) =>
          `${key}${parameters[key]}`,
      )
      .join("");

  return createHmac(
    "sha256",
    secretKey,
  )
    .update(contentToSign)
    .digest("hex");
}

function createEncodedBody(
  parameters: FlowParameters,
) {
  const searchParams =
    new URLSearchParams();

  for (
    const [key, value] of
    Object.entries(parameters)
  ) {
    searchParams.set(
      key,
      String(value),
    );
  }

  return searchParams;
}

async function readFlowResponse(
  response: Response,
) {
  const rawBody =
    await response.text();

  let parsedBody:
    | Record<string, unknown>
    | null = null;

  try {
    parsedBody =
      JSON.parse(rawBody) as Record<
        string,
        unknown
      >;
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    const message =
      typeof parsedBody?.message ===
      "string"
        ? parsedBody.message
        : typeof parsedBody?.error ===
            "string"
          ? parsedBody.error
          : rawBody ||
            `Flow respondió con estado ${response.status}.`;

    throw new Error(
      `Flow rechazó la solicitud: ${message}`,
    );
  }

  if (!parsedBody) {
    throw new Error(
      "Flow respondió sin un JSON válido.",
    );
  }

  return parsedBody;
}

function validateEmail(
  email: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email.trim(),
  );
}

function isValidFlowStatus(
  value: number,
): value is 1 | 2 | 3 | 4 {
  return [1, 2, 3, 4].includes(
    value,
  );
}

export async function createFlowPayment({
  commerceOrder,
  subject,
  amount,
  email,
  urlConfirmation,
  urlReturn,
  optional,
}: CreateFlowPaymentInput): Promise<CreateFlowPaymentResponse> {
  const configuration =
    getFlowConfiguration();

  const normalizedAmount =
    Math.round(amount);

  if (
    !Number.isFinite(
      normalizedAmount,
    ) ||
    normalizedAmount <= 0
  ) {
    throw new Error(
      "El monto enviado a Flow no es válido.",
    );
  }

  if (!validateEmail(email)) {
    throw new Error(
      "El cliente no tiene un correo válido para generar el pago.",
    );
  }

  const parameters: FlowParameters = {
    apiKey:
      configuration.apiKey,

    commerceOrder,

    subject,

    currency:
      "CLP",

    amount:
      normalizedAmount,

    email:
      email.trim(),

    paymentMethod:
      9,

    urlConfirmation,

    urlReturn,
  };

  if (optional) {
    parameters.optional =
      JSON.stringify(optional);
  }

  const signature =
    createFlowSignature(
      parameters,
      configuration.secretKey,
    );

  const body =
    createEncodedBody({
      ...parameters,
      s: signature,
    });

  const response =
    await fetch(
      `${configuration.apiUrl}/payment/create`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,

        cache: "no-store",
      },
    );

  const result =
    await readFlowResponse(
      response,
    );

  const url =
    typeof result.url ===
    "string"
      ? result.url
      : "";

  const token =
    typeof result.token ===
    "string"
      ? result.token
      : "";

  const flowOrder =
    Number(result.flowOrder);

  if (
    !url ||
    !token ||
    !Number.isInteger(flowOrder)
  ) {
    throw new Error(
      "Flow no devolvió la URL, el token o el número de orden esperado.",
    );
  }

  return {
    url:
      `${url}?token=${encodeURIComponent(
        token,
      )}`,

    token,

    flowOrder,
  };
}

export async function getFlowPaymentStatus(
  token: string,
): Promise<FlowPaymentStatusResponse> {
  const normalizedToken =
    token.trim();

  if (!normalizedToken) {
    throw new Error(
      "Flow no entregó un token válido.",
    );
  }

  const configuration =
    getFlowConfiguration();

  const parameters: FlowParameters = {
    apiKey:
      configuration.apiKey,

    token:
      normalizedToken,
  };

  const signature =
    createFlowSignature(
      parameters,
      configuration.secretKey,
    );

  const query =
    createEncodedBody({
      ...parameters,
      s: signature,
    });

  const response =
    await fetch(
      `${configuration.apiUrl}/payment/getStatus?${query.toString()}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

  const result =
    await readFlowResponse(
      response,
    );

  const flowOrder =
    Number(result.flowOrder);

  const status =
    Number(result.status);

  const amount =
    Number(result.amount);

  const commerceOrder =
    typeof result.commerceOrder ===
    "string"
      ? result.commerceOrder
      : "";

  if (
    !Number.isInteger(flowOrder) ||
    !commerceOrder ||
    !isValidFlowStatus(status) ||
    !Number.isFinite(amount)
  ) {
    throw new Error(
      "Flow devolvió un estado de pago incompleto o inválido.",
    );
  }

  return {
    ...result,

    flowOrder,

    commerceOrder,

    status,

    amount,

    requestDate:
      typeof result.requestDate ===
      "string"
        ? result.requestDate
        : "",

    subject:
      typeof result.subject ===
      "string"
        ? result.subject
        : "",

    currency:
      typeof result.currency ===
      "string"
        ? result.currency
        : "CLP",

    payer:
      typeof result.payer ===
      "string"
        ? result.payer
        : "",

    optional:
      (result.optional ??
        null) as FlowPaymentStatusResponse["optional"],

    pending_info:
      (result.pending_info ??
        null) as FlowPaymentStatusResponse["pending_info"],

    paymentData:
      (result.paymentData ??
        null) as FlowPaymentStatusResponse["paymentData"],

    merchantId:
      typeof result.merchantId ===
      "string"
        ? result.merchantId
        : null,
  };
}