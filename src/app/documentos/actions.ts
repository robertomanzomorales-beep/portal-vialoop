"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const documentTypes = [
  "CONTRACT",
  "QUOTATION",
  "INVOICE",
  "PAYMENT_RECEIPT",
  "REPORT",
  "MANUAL",
  "LOGO",
  "TEXT",
  "IMAGE",
  "BACKUP",
  "TECHNICAL",
  "OTHER",
] as const;

type DocumentType =
  (typeof documentTypes)[number];

function getFormValue(
  formData: FormData,
  field: string,
) {
  const value = formData.get(field);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function isValidFileUrl(value: string) {
  try {
    const url = new URL(value);

    return [
      "http:",
      "https:",
    ].includes(url.protocol);
  } catch {
    return false;
  }
}

function getMimeTypeFromUrl(fileUrl: string) {
  const cleanUrl = fileUrl
    .split("?")[0]
    .split("#")[0]
    .toLocaleLowerCase();

  const extension = cleanUrl.split(".").pop();

  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    svg: "image/svg+xml",
    zip: "application/zip",
  };

  return extension
    ? mimeTypes[extension] ?? null
    : null;
}

async function getValidatedDocumentData(
  formData: FormData,
  errorPath: string,
) {
  const clientId = getFormValue(
    formData,
    "clientId",
  );

  const projectId =
    getFormValue(formData, "projectId") ||
    null;

  const name = getFormValue(
    formData,
    "name",
  );

  const requestedType = getFormValue(
    formData,
    "type",
  );

  const fileUrl = getFormValue(
    formData,
    "fileUrl",
  );

  const description =
    getFormValue(formData, "description") ||
    null;

  if (
    !clientId ||
    !name ||
    !fileUrl
  ) {
    redirect(`${errorPath}?error=campos`);
  }

  if (!isValidFileUrl(fileUrl)) {
    redirect(`${errorPath}?error=enlace`);
  }

  const type: DocumentType =
    documentTypes.includes(
      requestedType as DocumentType,
    )
      ? (requestedType as DocumentType)
      : "OTHER";

  const [
    client,
    project,
  ] = await Promise.all([
    prisma.client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
      },
    }),
    projectId
      ? prisma.project.findUnique({
          where: {
            id: projectId,
          },
          select: {
            id: true,
            clientId: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!client) {
    redirect(`${errorPath}?error=cliente`);
  }

  if (
    projectId &&
    (!project ||
      project.clientId !== clientId)
  ) {
    redirect(`${errorPath}?error=proyecto`);
  }

  return {
    clientId,
    projectId,
    name,
    type,
    fileUrl,
    mimeType:
      getMimeTypeFromUrl(fileUrl),
    description,
    visibleToClient:
      formData.get("visibleToClient") ===
      "on",
  };
}

export async function createDocument(
  formData: FormData,
) {
  const data =
    await getValidatedDocumentData(
      formData,
      "/documentos/nuevo",
    );

  await prisma.document.create({
    data,
  });

  revalidatePath("/documentos");
  revalidatePath(
    `/clientes/${data.clientId}`,
  );

  redirect(
    "/documentos?resultado=creado",
  );
}

export async function updateDocument(
  documentId: string,
  formData: FormData,
) {
  const existingDocument =
    await prisma.document.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        clientId: true,
      },
    });

  if (!existingDocument) {
    redirect("/documentos");
  }

  const data =
    await getValidatedDocumentData(
      formData,
      `/documentos/${documentId}/editar`,
    );

  await prisma.document.update({
    where: {
      id: documentId,
    },
    data,
  });

  revalidatePath("/documentos");
  revalidatePath(
    `/clientes/${existingDocument.clientId}`,
  );
  revalidatePath(
    `/clientes/${data.clientId}`,
  );

  redirect(
    "/documentos?resultado=actualizado",
  );
}

export async function deleteDocument(
  documentId: string,
  _formData: FormData,
) {
  const existingDocument =
    await prisma.document.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        clientId: true,
      },
    });

  if (!existingDocument) {
    redirect("/documentos");
  }

  await prisma.document.delete({
    where: {
      id: documentId,
    },
  });

  revalidatePath("/documentos");
  revalidatePath(
    `/clientes/${existingDocument.clientId}`,
  );

  redirect(
    "/documentos?resultado=eliminado",
  );
}
