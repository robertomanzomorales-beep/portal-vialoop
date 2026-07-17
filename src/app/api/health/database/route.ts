import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const planCount = await prisma.plan.count();

    return NextResponse.json({
      success: true,
      message: "Conexión con PostgreSQL funcionando correctamente.",
      planCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al conectar con PostgreSQL:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No fue posible conectar con PostgreSQL.",
      },
      { status: 500 },
    );
  }
}