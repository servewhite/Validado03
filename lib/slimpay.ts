// SlimPay API Integration
// Documentation: https://app.slimmpayy.com.br/api/v1

const SLIMPAY_API_URL = "https://app.slimmpayy.com.br/api/v1"

// ============ TYPES ============

export interface SlimPayClient {
  name: string
  email: string
  phone: string
  document: string // CPF ou CNPJ - campo obrigatorio
  cpf?: string
  cnpj?: string
  address?: {
    country: string
    zipCode: string
    state: string
    city: string
    neighborhood: string
    street: string
    number: string
    complement?: string
  }
}

export interface SlimPayProduct {
  id: string
  name: string
  price: number
  quantity: number
}

export interface SlimPaySplit {
  accountId: string
  amount: number
}

export interface SlimPayPixRequest {
  identifier: string
  amount: number
  shippingFee?: number
  extraFee?: number
  discount?: number
  client: SlimPayClient
  products?: SlimPayProduct[]
  splits?: SlimPaySplit[]
  dueDate?: string
  metadata?: Record<string, string | number | boolean>
  callbackUrl?: string
}

export interface SlimPayPixResponse {
  transactionId: string
  status: "OK" | "FAILED" | "PENDING" | "REJECTED" | "CANCELED"
  fee: number
  order: {
    id: string
    amount: number
    currency: string
  }
  pix: {
    qrCode: string
    expiresAt: string
  }
  details?: string
  errorDescription?: string
}

export interface SlimPayTransaction {
  id: string
  identifier: string
  status: "COMPLETED" | "PENDING" | "FAILED" | "REFUNDED" | "CHARGED_BACK"
  paymentMethod: "PIX" | "BOLETO" | "CREDIT_CARD" | "SPLIT" | "TED" | "DYNAMIC"
  amount: number
  currency: string
  createdAt: string
  payedAt?: string
  pixInformation?: {
    qrCode: string
    endToEndId?: string
  }
}

export interface SlimPayWebhookPayload {
  event: "TRANSACTION_CREATED" | "TRANSACTION_PAID" | "TRANSACTION_CANCELED" | "TRANSACTION_REFUNDED"
  token: string
  offerCode?: string
  client: {
    id: string
    name: string
    email: string
    phone: string
    cpf?: string
    cnpj?: string
    address?: {
      country: string
      zipCode: string
      state: string
      city: string
      neighborhood: string
      street: string
      number: string
      complement?: string
    }
  }
  transaction: {
    id: string
    identifier: string
    status: "COMPLETED" | "PENDING" | "FAILED" | "REFUNDED" | "CHARGED_BACK"
    paymentMethod: string
    originalCurrency: string
    originalAmount: number
    currency: string
    exchangeRate?: number
    installments: number
    amount: number
    createdAt: string
    payedAt?: string
    pixInformation?: {
      qrCode: string
      endToEndId?: string
    }
  }
  orderItems: Array<{
    id: string
    price: number
    product: {
      id: string
      name: string
      externalId?: string
    }
  }>
  trackProps?: Record<string, string>
}

export interface SlimPayError {
  statusCode: number
  errorCode: string
  message: string
  details?: Record<string, string>
}

// ============ API FUNCTIONS ============

function getHeaders(): HeadersInit {
  const publicKey = process.env.SLIMPAY_PUBLIC_KEY
  const secretKey = process.env.SLIMPAY_SECRET_KEY

  if (!publicKey || !secretKey) {
    throw new Error("SlimPay credentials not configured. Please set SLIMPAY_PUBLIC_KEY and SLIMPAY_SECRET_KEY environment variables.")
  }

  return {
    "Content-Type": "application/json",
    "x-public-key": publicKey,
    "x-secret-key": secretKey,
  }
}

/**
 * Create a PIX payment request
 */
export async function createPixPayment(data: SlimPayPixRequest): Promise<{
  success: boolean
  data?: SlimPayPixResponse
  error?: string
  errorCode?: string
}> {
  try {
    console.log("[SlimPay] Creating PIX payment with data:", JSON.stringify(data, null, 2))
    
    const response = await fetch(`${SLIMPAY_API_URL}/gateway/pix/receive`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      const error = result as SlimPayError
      console.error("[SlimPay] Error response status:", response.status)
      console.error("[SlimPay] Error details:", JSON.stringify(result, null, 2))
      if (result.details) {
        console.error("[SlimPay] Error Details:", JSON.stringify(result.details, null, 2))
      }
      return {
        success: false,
        error: error.message || "Erro ao criar cobranca PIX",
        errorCode: error.errorCode,
      }
    }

    return {
      success: true,
      data: result as SlimPayPixResponse,
    }
  } catch (error) {
    console.error("[SlimPay] Error creating PIX payment:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro de conexao com SlimPay",
    }
  }
}

/**
 * Get transaction status by ID or client identifier
 */
export async function getTransaction(params: {
  id?: string
  clientIdentifier?: string
}): Promise<{
  success: boolean
  data?: SlimPayTransaction
  error?: string
}> {
  try {
    const searchParams = new URLSearchParams()
    if (params.id) searchParams.set("id", params.id)
    if (params.clientIdentifier) searchParams.set("clientIdentifier", params.clientIdentifier)

    const response = await fetch(
      `${SLIMPAY_API_URL}/gateway/transactions?${searchParams.toString()}`,
      {
        method: "GET",
        headers: getHeaders(),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      const error = result as SlimPayError
      return {
        success: false,
        error: error.message || "Erro ao buscar transacao",
      }
    }

    return {
      success: true,
      data: result as SlimPayTransaction,
    }
  } catch (error) {
    console.error("[SlimPay] Error getting transaction:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro de conexao com SlimPay",
    }
  }
}

/**
 * Verify webhook token
 */
export function verifyWebhookToken(receivedToken: string, expectedToken?: string): boolean {
  if (!expectedToken) {
    // If no expected token is configured, we can't verify
    console.warn("[SlimPay] No webhook token configured for verification")
    return true
  }
  return receivedToken === expectedToken
}

/**
 * Map SlimPay status to internal status
 */
export function mapSlimPayStatus(status: string): "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback" {
  switch (status) {
    case "COMPLETED":
      return "paid"
    case "PENDING":
      return "waiting_payment"
    case "FAILED":
    case "REJECTED":
    case "CANCELED":
      return "refused"
    case "REFUNDED":
      return "refunded"
    case "CHARGED_BACK":
      return "chargedback"
    default:
      return "waiting_payment"
  }
}

/**
 * Generate unique order identifier
 */
export function generateOrderId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `ORD-${timestamp}-${random}`.toUpperCase()
}
