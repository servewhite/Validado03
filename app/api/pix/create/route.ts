import { NextResponse } from "next/server"
import { createPixPayment, generateOrderId } from "@/lib/slimpay"
import { sendOrderToUtmfy } from "@/lib/utmfy"

interface CreatePixRequest {
  customer: {
    name: string
    email: string
    cpf: string
    phone: string
  }
  address: {
    cep: string
    street: string
    number: string
    complement?: string
    neighborhood: string
    city: string
    state: string
  }
  items: Array<{
    id: string
    name: string
    price: number
    quantity: number
  }>
  total: number
  shipping?: {
    id: string
    name: string
    price: number
    days: string
  }
  trackingParams?: {
    src?: string
    sck?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
}

export async function POST(request: Request) {
  try {
    const body: CreatePixRequest = await request.json()
    const { customer, address, items, total, shipping, trackingParams } = body

    // Validate required fields
    if (!customer?.name || !customer?.email || !customer?.cpf || !customer?.phone) {
      return NextResponse.json(
        { error: "Dados do cliente incompletos" },
        { status: 400 }
      )
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Carrinho vazio" },
        { status: 400 }
      )
    }

    // Generate unique order ID
    const orderId = generateOrderId()

    // Calculate totals
    const productsTotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0)
    const shippingFee = shipping?.price || 0
    const finalAmount = productsTotal + shippingFee

    // Format CPF (remove non-numeric characters)
    const cpfClean = customer.cpf.replace(/\D/g, "")
    
    // Format phone (only numbers with DDD, e.g., 11999999999)
    const phoneClean = customer.phone.replace(/\D/g, "")
    
    // Format CEP with hyphen (e.g., 12345-678)
    const cepNumbers = address.cep.replace(/\D/g, "")
    const cepFormatted = cepNumbers.length === 8 
      ? `${cepNumbers.slice(0, 5)}-${cepNumbers.slice(5)}` 
      : cepNumbers

    // Validate CPF has 11 digits
    if (cpfClean.length !== 11) {
      return NextResponse.json(
        { error: "CPF invalido. Deve conter 11 digitos." },
        { status: 400 }
      )
    }

    // Create PIX payment with SlimPay
    const pixResult = await createPixPayment({
      identifier: orderId,
      amount: finalAmount,
      shippingFee: shippingFee,
      discount: 0,
      client: {
        name: customer.name,
        email: customer.email,
        phone: phoneClean,
        document: cpfClean, // Campo obrigatorio - CPF apenas numeros (11 digitos)
        cpf: cpfClean,
        address: {
          country: "BR",
          zipCode: cepFormatted,
          state: address.state,
          city: address.city,
          neighborhood: address.neighborhood,
          street: address.street,
          number: address.number,
          complement: address.complement || "",
        },
      },
      products: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      metadata: {
        source: "CometaPapelaria",
        ...(trackingParams?.utm_source && { utm_source: trackingParams.utm_source }),
        ...(trackingParams?.utm_medium && { utm_medium: trackingParams.utm_medium }),
        ...(trackingParams?.utm_campaign && { utm_campaign: trackingParams.utm_campaign }),
      },
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/webhook/slimpay`,
    })

    if (!pixResult.success || !pixResult.data) {
      console.error("[PIX Create] SlimPay error:", pixResult.error)
      return NextResponse.json(
        { error: pixResult.error || "Erro ao gerar PIX" },
        { status: 400 }
      )
    }

    const { transactionId, pix, order } = pixResult.data

    // Send to UTMfy for tracking (waiting_payment status)
    const totalInCents = Math.round(finalAmount * 100)
    try {
      await sendOrderToUtmfy({
        orderId: orderId,
        status: "waiting_payment",
        paymentMethod: "pix",
        customer: {
          name: customer.name,
          email: customer.email,
          phone: phoneClean,
          document: cpfClean,
        },
        products: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          priceInCents: Math.round(item.price * 100),
        })),
        commission: {
          totalPriceInCents: totalInCents,
          gatewayFeeInCents: 0,
          userCommissionInCents: totalInCents,
        },
        trackingParams: trackingParams || {},
      })
    } catch (utmfyError) {
      console.error("[PIX Create] UTMfy error:", utmfyError)
      // Don't fail the request if UTMfy fails
    }

    return NextResponse.json({
      success: true,
      transactionId: transactionId,
      orderId: orderId,
      pix: {
        qrcode: pix.qrCode,
        expiresAt: pix.expiresAt,
      },
      order: {
        id: order.id,
        amount: order.amount,
      },
    })
  } catch (error) {
    console.error("[PIX Create] Error:", error)
    return NextResponse.json(
      { error: "Erro interno ao processar pagamento" },
      { status: 500 }
    )
  }
}
