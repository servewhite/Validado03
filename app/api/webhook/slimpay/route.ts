import { NextResponse } from "next/server"
import type { SlimPayWebhookPayload } from "@/lib/slimpay"
import { mapSlimPayStatus, verifyWebhookToken } from "@/lib/slimpay"
import { sendOrderToUtmfy } from "@/lib/utmfy"

export async function POST(request: Request) {
  try {
    const payload: SlimPayWebhookPayload = await request.json()

    console.log("[SlimPay Webhook] Received event:", payload.event)
    console.log("[SlimPay Webhook] Transaction ID:", payload.transaction?.id)
    console.log("[SlimPay Webhook] Order ID:", payload.transaction?.identifier)

    // Verify webhook token if configured
    const expectedToken = process.env.SLIMPAY_WEBHOOK_TOKEN
    if (expectedToken && !verifyWebhookToken(payload.token, expectedToken)) {
      console.error("[SlimPay Webhook] Invalid token")
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { event, transaction, client, orderItems, trackProps } = payload

    // Map SlimPay status to internal status
    const mappedStatus = mapSlimPayStatus(transaction.status)

    // Handle different events
    switch (event) {
      case "TRANSACTION_PAID":
        console.log("[SlimPay Webhook] Payment confirmed for order:", transaction.identifier)
        
        // Update UTMfy with approved status
        const paidTotalInCents = Math.round(transaction.amount * 100)
        try {
          await sendOrderToUtmfy({
            orderId: transaction.identifier,
            status: "approved",
            paymentMethod: transaction.paymentMethod.toLowerCase() as "pix" | "boleto" | "credit_card",
            customer: {
              name: client.name,
              email: client.email,
              phone: client.phone,
              document: client.cpf || client.cnpj || "",
            },
            products: orderItems.map((item) => ({
              id: item.product.externalId || item.product.id,
              name: item.product.name,
              quantity: 1,
              priceInCents: Math.round(item.price * 100),
            })),
            commission: {
              totalPriceInCents: paidTotalInCents,
              gatewayFeeInCents: 0,
              userCommissionInCents: paidTotalInCents,
            },
            trackingParams: trackProps || {},
            approvedDate: transaction.payedAt,
          })
        } catch (utmfyError) {
          console.error("[SlimPay Webhook] UTMfy update error:", utmfyError)
        }
        break

      case "TRANSACTION_CANCELED":
        console.log("[SlimPay Webhook] Transaction canceled:", transaction.identifier)
        
        const canceledTotalInCents = Math.round(transaction.amount * 100)
        try {
          await sendOrderToUtmfy({
            orderId: transaction.identifier,
            status: "refused",
            paymentMethod: transaction.paymentMethod.toLowerCase() as "pix" | "boleto" | "credit_card",
            customer: {
              name: client.name,
              email: client.email,
              phone: client.phone,
              document: client.cpf || client.cnpj || "",
            },
            products: orderItems.map((item) => ({
              id: item.product.externalId || item.product.id,
              name: item.product.name,
              quantity: 1,
              priceInCents: Math.round(item.price * 100),
            })),
            commission: {
              totalPriceInCents: canceledTotalInCents,
              gatewayFeeInCents: 0,
              userCommissionInCents: canceledTotalInCents,
            },
            trackingParams: trackProps || {},
          })
        } catch (utmfyError) {
          console.error("[SlimPay Webhook] UTMfy update error:", utmfyError)
        }
        break

      case "TRANSACTION_REFUNDED":
        console.log("[SlimPay Webhook] Transaction refunded:", transaction.identifier)
        
        const refundedTotalInCents = Math.round(transaction.amount * 100)
        try {
          await sendOrderToUtmfy({
            orderId: transaction.identifier,
            status: "refunded",
            paymentMethod: transaction.paymentMethod.toLowerCase() as "pix" | "boleto" | "credit_card",
            customer: {
              name: client.name,
              email: client.email,
              phone: client.phone,
              document: client.cpf || client.cnpj || "",
            },
            products: orderItems.map((item) => ({
              id: item.product.externalId || item.product.id,
              name: item.product.name,
              quantity: 1,
              priceInCents: Math.round(item.price * 100),
            })),
            commission: {
              totalPriceInCents: refundedTotalInCents,
              gatewayFeeInCents: 0,
              userCommissionInCents: refundedTotalInCents,
            },
            trackingParams: trackProps || {},
          })
        } catch (utmfyError) {
          console.error("[SlimPay Webhook] UTMfy update error:", utmfyError)
        }
        break

      case "TRANSACTION_CREATED":
        console.log("[SlimPay Webhook] Transaction created:", transaction.identifier)
        // Transaction created - usually already handled in /api/pix/create
        break

      default:
        console.log("[SlimPay Webhook] Unknown event:", event)
    }

    // Return 200 OK to acknowledge receipt
    return NextResponse.json({
      success: true,
      event: event,
      orderId: transaction.identifier,
      status: mappedStatus,
    })
  } catch (error) {
    console.error("[SlimPay Webhook] Error processing webhook:", error)
    // Return 200 to prevent retries for parsing errors
    return NextResponse.json(
      { error: "Error processing webhook" },
      { status: 200 }
    )
  }
}
