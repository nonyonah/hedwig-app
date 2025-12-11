;; Hedwig Payment Processor - Clarity 4 Smart Contract
;; 
;; Purpose: Process STX payments with 1% platform fee
;; Fee split: 99% to freelancer, 1% to platform
;; 
;; Compatible with Stacks Testnet and Mainnet

;; ============================================
;; Constants
;; ============================================

;; Platform fee: 100 basis points = 1%
(define-constant PLATFORM_FEE_BPS u100)
(define-constant BPS_DENOMINATOR u10000)

;; Error codes
(define-constant ERR_INVALID_AMOUNT (err u1))
(define-constant ERR_TRANSFER_FAILED (err u2))
(define-constant ERR_NOT_AUTHORIZED (err u3))
(define-constant ERR_INVALID_RECIPIENT (err u4))

;; ============================================
;; Data Variables
;; ============================================

;; Platform wallet address (receives 1% fee)
(define-data-var platform-address principal 'ST11ATDDMT63A2GZAHWCEKRWFSGNS6B26BYPJRTM0)

;; Contract owner (can update platform address)
(define-data-var contract-owner principal tx-sender)

;; Payment counter for tracking
(define-data-var payment-counter uint u0)

;; ============================================
;; Data Maps
;; ============================================

;; Payment records - maps payment ID to payment details
(define-map payments
    { payment-id: uint }
    {
        payer: principal,
        recipient: principal,
        total-amount: uint,
        freelancer-amount: uint,
        platform-fee: uint,
        invoice-id: (optional (string-ascii 64)),
        timestamp: uint
    }
)

;; ============================================
;; Read-Only Functions
;; ============================================

;; Get platform fee in basis points (100 = 1%)
(define-read-only (get-platform-fee-bps)
    PLATFORM_FEE_BPS
)

;; Get platform address
(define-read-only (get-platform-address)
    (var-get platform-address)
)

;; Get contract owner
(define-read-only (get-contract-owner)
    (var-get contract-owner)
)

;; Get total payments count
(define-read-only (get-payment-count)
    (var-get payment-counter)
)

;; Calculate fee split for a given amount
;; Returns: { freelancer-amount, platform-fee }
(define-read-only (calculate-fee-split (amount uint))
    (let
        (
            (platform-fee (/ (* amount PLATFORM_FEE_BPS) BPS_DENOMINATOR))
            (freelancer-amount (- amount platform-fee))
        )
        {
            freelancer-amount: freelancer-amount,
            platform-fee: platform-fee
        }
    )
)

;; Get payment details by ID
(define-read-only (get-payment (payment-id uint))
    (map-get? payments { payment-id: payment-id })
)

;; ============================================
;; Public Functions
;; ============================================

;; Pay an invoice - splits payment between freelancer (99%) and platform (1%)
;; @param recipient - Freelancer's Stacks address to receive 99%
;; @param amount - Total payment amount in microSTX
;; @param invoice-id - Optional invoice reference ID
(define-public (pay-invoice 
    (recipient principal) 
    (amount uint) 
    (invoice-id (optional (string-ascii 64))))
    (let
        (
            ;; Calculate fee split
            (fee-split (calculate-fee-split amount))
            (freelancer-amount (get freelancer-amount fee-split))
            (platform-fee (get platform-fee fee-split))
            (platform-addr (var-get platform-address))
            (current-payment-id (var-get payment-counter))
        )
        ;; Validate amount is greater than 0
        (asserts! (> amount u0) ERR_INVALID_AMOUNT)
        
        ;; Validate recipient is not the contract
        (asserts! (not (is-eq recipient (as-contract tx-sender))) ERR_INVALID_RECIPIENT)
        
        ;; Transfer 99% to freelancer
        (try! (stx-transfer? freelancer-amount tx-sender recipient))
        
        ;; Transfer 1% to platform (only if fee > 0)
        (if (> platform-fee u0)
            (try! (stx-transfer? platform-fee tx-sender platform-addr))
            true
        )
        
        ;; Record the payment
        (map-set payments
            { payment-id: current-payment-id }
            {
                payer: tx-sender,
                recipient: recipient,
                total-amount: amount,
                freelancer-amount: freelancer-amount,
                platform-fee: platform-fee,
                invoice-id: invoice-id,
                timestamp: block-height
            }
        )
        
        ;; Increment payment counter
        (var-set payment-counter (+ current-payment-id u1))
        
        ;; Return success with payment ID
        (ok current-payment-id)
    )
)

;; Simple payment without invoice ID
;; @param recipient - Freelancer's Stacks address
;; @param amount - Total payment amount in microSTX
(define-public (pay (recipient principal) (amount uint))
    (pay-invoice recipient amount none)
)

;; ============================================
;; Admin Functions
;; ============================================

;; Update platform address (only contract owner)
(define-public (set-platform-address (new-address principal))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
        (var-set platform-address new-address)
        (ok true)
    )
)

;; Transfer contract ownership (only current owner)
(define-public (transfer-ownership (new-owner principal))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
        (var-set contract-owner new-owner)
        (ok true)
    )
)
