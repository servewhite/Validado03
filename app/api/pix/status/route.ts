import { NextResponse } from "next/server"
import { getTransaction, mapSlimPayStatus } from "@/lib/slimpay"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get("transactionId")
    const orderId = searchParams.get("orderId")

    if (!transactionId && !orderId) {
      return NextResponse.json(
        { error: "transactionId ou orderId é obrigatório" },
        { status: 400 }
      )
    }

    const result = await getTransaction({
      id: transactionId || undefined,
      clientIdentifier: orderId || undefined,
    })

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || "Transação não encontrada" },
        { status: 404 }
      )
    }

    const transaction = result.data
    const mappedStatus = mapSlimPayStatus(transaction.status)

    return NextResponse.json({
      transactionId: transaction.id,
      orderId: transaction.identifier,
      status: mappedStatus === "paid" ? "paid" : transaction.status.toLowerCase(),
      paymentMethod: transaction.paymentMethod,
      amount: transaction.amount,
      currency: transaction.currency,
      createdAt: transaction.createdAt,
      paidAt: transaction.payedAt,
      pixInfo: transaction.pixInformation
        ? {
            endToEndId: transaction.pixInformation.endToEndId,
          }
        : null,
    })
  } catch (error) {
    console.error("[PIX Status] Error:", error)
    return NextResponse.json(
      { error: "Erro ao verificar status do pagamento" },
      { status: 500 }
    )
  }
}
