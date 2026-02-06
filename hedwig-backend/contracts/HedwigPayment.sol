// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title HedwigPayment
 * @author Hedwig Team
 * @notice Secure ERC20 payment processor with automatic 0.5% platform fee split
 * @dev Atomically splits payments: 99.5% to freelancer, 0.5% to platform
 * 
 * Security Features:
 * - ReentrancyGuard: Prevents reentrancy attacks
 * - Pausable: Emergency circuit breaker
 * - SafeERC20: Safe token transfers (handles non-standard tokens)
 * - Ownable: Access control for admin functions
 * - Input validation: All parameters validated
 * - No delegatecall: Contract does not use delegatecall
 * - No external calls before state changes: CEI pattern followed
 */
contract HedwigPayment is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================

    /// @notice Platform fee in basis points (50 = 0.5%)
    uint256 public constant PLATFORM_FEE_BPS = 50;
    
    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    /// @notice Minimum payment amount to prevent dust attacks
    uint256 public constant MIN_PAYMENT_AMOUNT = 1000; // 0.001 USDC (6 decimals)

    // ============================================
    // State Variables
    // ============================================

    /// @notice Platform wallet that receives the 0.5% fee
    address public platformWallet;

    /// @notice Payment counter for tracking
    uint256 public paymentCount;

    /// @notice Mapping of whitelisted tokens (optional security measure)
    mapping(address => bool) public allowedTokens;
    
    /// @notice Whether token whitelist is enforced
    bool public tokenWhitelistEnabled;

    // ============================================
    // Events
    // ============================================

    /// @notice Emitted when a payment is processed
    event PaymentProcessed(
        uint256 indexed paymentId,
        address indexed payer,
        address indexed freelancer,
        address token,
        uint256 totalAmount,
        uint256 freelancerAmount,
        uint256 platformFee,
        string invoiceId
    );

    /// @notice Emitted when platform wallet is updated
    event PlatformWalletUpdated(
        address indexed oldWallet, 
        address indexed newWallet
    );

    /// @notice Emitted when a token is added/removed from whitelist
    event TokenWhitelistUpdated(address indexed token, bool allowed);

    /// @notice Emitted when whitelist enforcement is toggled
    event WhitelistEnforcementUpdated(bool enabled);

    // ============================================
    // Errors (Custom errors save gas)
    // ============================================

    error InvalidAddress();
    error InvalidAmount();
    error TokenNotAllowed();
    error SelfPaymentNotAllowed();
    error ZeroFee();

    // ============================================
    // Constructor
    // ============================================

    /**
     * @notice Initialize contract with platform wallet
     * @param _platformWallet Address to receive platform fees
     */
    constructor(address _platformWallet) Ownable(msg.sender) {
        if (_platformWallet == address(0)) revert InvalidAddress();
        platformWallet = _platformWallet;
        tokenWhitelistEnabled = false; // Disabled by default for flexibility
    }

    // ============================================
    // External Functions
    // ============================================

    /**
     * @notice Process a payment with automatic 0.5% fee split
     * @dev Uses CEI (Checks-Effects-Interactions) pattern for security
     * @param token ERC20 token address for payment
     * @param amount Total payment amount (must be >= MIN_PAYMENT_AMOUNT)
     * @param freelancer Recipient address (gets 99.5%)
     * @param invoiceId Reference ID for the payment (for off-chain tracking)
     */
    function pay(
        address token,
        uint256 amount,
        address freelancer,
        string calldata invoiceId
    ) external nonReentrant whenNotPaused {
        // ===== CHECKS =====
        if (token == address(0)) revert InvalidAddress();
        if (freelancer == address(0)) revert InvalidAddress();
        if (amount < MIN_PAYMENT_AMOUNT) revert InvalidAmount();
        if (freelancer == msg.sender) revert SelfPaymentNotAllowed();
        
        // Check token whitelist if enabled
        if (tokenWhitelistEnabled && !allowedTokens[token]) {
            revert TokenNotAllowed();
        }

        // Calculate fee split
        uint256 platformFee = (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 freelancerAmount = amount - platformFee;

        // ===== EFFECTS =====
        // Increment payment counter BEFORE external calls
        unchecked {
            paymentCount++;
        }
        uint256 currentPaymentId = paymentCount;

        // ===== INTERACTIONS =====
        // Transfer tokens from payer to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Transfer 99.5% to freelancer
        IERC20(token).safeTransfer(freelancer, freelancerAmount);

        // Transfer 0.5% to platform (only if fee > 0)
        if (platformFee > 0) {
            IERC20(token).safeTransfer(platformWallet, platformFee);
        }

        // Emit event for off-chain tracking
        emit PaymentProcessed(
            currentPaymentId,
            msg.sender,
            freelancer,
            token,
            amount,
            freelancerAmount,
            platformFee,
            invoiceId
        );
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Calculate fee split for a given amount
     * @param amount Total payment amount
     * @return freelancerAmount Amount the freelancer receives (99.5%)
     * @return platformFee Amount the platform receives (0.5%)
     */
    function calculateFeeSplit(uint256 amount) 
        external 
        pure 
        returns (uint256 freelancerAmount, uint256 platformFee) 
    {
        platformFee = (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        freelancerAmount = amount - platformFee;
    }

    /**
     * @notice Check if a token is allowed (when whitelist is enabled)
     * @param token Token address to check
     * @return bool True if token is allowed or whitelist is disabled
     */
    function isTokenAllowed(address token) external view returns (bool) {
        if (!tokenWhitelistEnabled) return true;
        return allowedTokens[token];
    }

    // ============================================
    // Admin Functions (Owner Only)
    // ============================================

    /**
     * @notice Update the platform wallet address
     * @param newWallet New address to receive platform fees
     */
    function setPlatformWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        address oldWallet = platformWallet;
        platformWallet = newWallet;
        emit PlatformWalletUpdated(oldWallet, newWallet);
    }

    /**
     * @notice Add or remove a token from the whitelist
     * @param token Token address
     * @param allowed Whether the token is allowed
     */
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        allowedTokens[token] = allowed;
        emit TokenWhitelistUpdated(token, allowed);
    }

    /**
     * @notice Enable or disable token whitelist enforcement
     * @param enabled Whether to enforce the whitelist
     */
    function setWhitelistEnabled(bool enabled) external onlyOwner {
        tokenWhitelistEnabled = enabled;
        emit WhitelistEnforcementUpdated(enabled);
    }

    /**
     * @notice Pause the contract (emergency use only)
     * @dev Prevents all payments while paused
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdraw function (owner only)
     * @dev Only for recovering stuck tokens, not for normal operation
     * @param token Token address to withdraw
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
