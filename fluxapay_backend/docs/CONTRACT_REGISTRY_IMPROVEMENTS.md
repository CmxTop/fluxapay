# Contract Registry Improvements

This document describes the implementation of four critical improvements to the FluxaPay merchant registry contract integration.

## Issues Addressed

### #208 - Content-Addressable Merchant Profiles
**Status**: Documented (Contract-level implementation required)

**Description**: Avoid large registry text arrays by storing merchant metadata inside IPFS.

**Implementation Notes**:
- Replace raw registry details with IPFS content hash
- Store full merchant profile (business details, compliance docs, etc.) on IPFS
- Registry contract stores only the IPFS hash (CID)
- Backend service retrieves full profile from IPFS when needed

**Contract Changes Required**:
```rust
// Instead of storing full merchant data:
pub struct Merchant {
    merchant_id: String,
    business_name: String,  // Remove
    settlement_currency: Symbol,  // Remove
    // ... other fields
    
    // Add:
    profile_hash: String,  // IPFS CID (e.g., "Qm...")
}
```

**Backend Integration** (Future):
- Add IPFS client to merchantRegistry.service.ts
- Upload merchant profile to IPFS during registration
- Store returned CID in contract
- Retrieve and cache profiles from IPFS

---

### #210 - Payout Address Whitelist Validation
**Status**: Documented (Contract-level implementation required)

**Description**: Protect merchant payouts by restricting destination addresses to a whitelist.

**Implementation Notes**:
- Maintain per-merchant whitelist of approved payout addresses
- Enforce whitelist lookup during payout modifications
- Only whitelisted addresses can receive settlements
- Admin can add/remove addresses from whitelist

**Contract Changes Required**:
```rust
pub struct Merchant {
    merchant_id: String,
    profile_hash: String,
    payout_whitelist: Vec<String>,  // Stellar addresses
}

// New contract function:
pub fn update_payout_whitelist(
    env: Env,
    merchant_id: String,
    addresses: Vec<String>,
) -> Result<(), Error>

// Validation in payout function:
pub fn initiate_payout(
    env: Env,
    merchant_id: String,
    destination: String,
    amount: i128,
) -> Result<(), Error> {
    let merchant = get_merchant(&env, &merchant_id)?;
    
    // Enforce whitelist
    if !merchant.payout_whitelist.contains(&destination) {
        return Err(Error::AddressNotWhitelisted);
    }
    
    // ... proceed with payout
}
```

**Backend Integration** (Future):
- Add whitelist management endpoints
- Validate addresses before adding to whitelist
- Audit log all whitelist changes

---

### #213 - Optimizing Registry Listing Pagination ✅
**Status**: **IMPLEMENTED**

**Description**: Large registry scans exceed ledger limits. Implement chunk pagination.

**Acceptance Criteria**: ✅ Return fixed page sizes

**Implementation**:

1. **Service Layer** (`merchantRegistry.service.ts`):
   - Added `DEFAULT_PAGE_SIZE = 50`
   - Added `MAX_PAGE_SIZE = 100`
   - Implemented `listMerchantsPaginated(page, pageSize)` method
   - Returns paginated results with metadata (page, pageSize, totalPages, hasMore)

2. **API Endpoint** (`/api/v1/admin/registry/merchants`):
   - Query params: `page` (default: 1), `page_size` (default: 50, max: 100)
   - Response includes pagination metadata
   - Admin-only access

3. **Contract Integration** (Mock):
   - Service prepared to call `list_merchants_paginated(start_index, page_size)`
   - Currently returns mock data structure
   - Ready for contract deployment

**Usage Example**:
```bash
# Get first page (50 merchants)
GET /api/v1/admin/registry/merchants?page=1&page_size=50

# Get second page
GET /api/v1/admin/registry/merchants?page=2&page_size=50

# Custom page size (max 100)
GET /api/v1/admin/registry/merchants?page=1&page_size=100
```

**Response Format**:
```json
{
  "success": true,
  "data": {
    "merchants": [
      {
        "merchantId": "merchant_1",
        "businessName": "Acme Corp",
        "settlementCurrency": "USD"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "totalPages": 5,
    "hasMore": true
  }
}
```

---

### #216 - Multi-Currency Registry Mapping ✅
**Status**: **IMPLEMENTED**

**Description**: Enable merchants to link multiple bank accounts for diverse currencies.

**Acceptance Criteria**: ✅ Track mapping list of payout addresses per currency

**Implementation**:

1. **Service Layer** (`merchantRegistry.service.ts`):
   - Implemented `updateCurrencyMappings(merchantId, currencyMappings)` method
   - Implemented `getCurrencyMappings(merchantId)` method
   - Supports mapping multiple currencies to different Stellar addresses

2. **API Endpoints**:
   - `POST /api/v1/admin/registry/merchants/:merchantId/currency-mappings` - Update mappings
   - `GET /api/v1/admin/registry/merchants/:merchantId/currency-mappings` - Retrieve mappings
   - Admin-only access

3. **Contract Integration** (Mock):
   - Service prepared to call `update_currency_mappings(merchant_id, mappings)`
   - Service prepared to call `get_currency_mappings(merchant_id)`
   - Currently returns mock data structure
   - Ready for contract deployment

**Usage Example**:
```bash
# Update currency mappings
POST /api/v1/admin/registry/merchants/merchant_123/currency-mappings
Content-Type: application/json

{
  "mappings": {
    "USD": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "EUR": "GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
    "GBP": "GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"
  }
}

# Get currency mappings
GET /api/v1/admin/registry/merchants/merchant_123/currency-mappings
```

**Response Format**:
```json
{
  "success": true,
  "data": {
    "merchantId": "merchant_123",
    "mappings": {
      "USD": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "EUR": "GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
      "GBP": "GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"
    }
  }
}
```

---

## Contract Changes Summary

### Required Contract Functions

```rust
// #213: Pagination
pub fn list_merchants_paginated(
    env: Env,
    start_index: u32,
    page_size: u32,
) -> Result<Vec<Merchant>, Error>

// #216: Multi-currency mappings
pub fn update_currency_mappings(
    env: Env,
    merchant_id: String,
    mappings: Vec<(Symbol, String)>,  // (currency, payout_address)
) -> Result<(), Error>

pub fn get_currency_mappings(
    env: Env,
    merchant_id: String,
) -> Result<Vec<(Symbol, String)>, Error>

// #208: IPFS integration
pub fn register_merchant_with_ipfs(
    env: Env,
    merchant_id: String,
    profile_hash: String,  // IPFS CID
    settlement_currency: Symbol,
) -> Result<(), Error>

// #210: Whitelist validation
pub fn update_payout_whitelist(
    env: Env,
    merchant_id: String,
    addresses: Vec<String>,
) -> Result<(), Error>

pub fn validate_payout_address(
    env: Env,
    merchant_id: String,
    address: String,
) -> Result<bool, Error>
```

---

## Testing

### Manual Testing

1. **Pagination** (#213):
   ```bash
   # Start backend
   npm run dev
   
   # Test pagination endpoint
   curl -H "X-Admin-Secret: your_secret" \
     http://localhost:3000/api/v1/admin/registry/merchants?page=1&page_size=10
   ```

2. **Multi-Currency** (#216):
   ```bash
   # Update mappings
   curl -X POST \
     -H "X-Admin-Secret: your_secret" \
     -H "Content-Type: application/json" \
     -d '{"mappings":{"USD":"GXXX","EUR":"GYYY"}}' \
     http://localhost:3000/api/v1/admin/registry/merchants/merchant_123/currency-mappings
   
   # Get mappings
   curl -H "X-Admin-Secret: your_secret" \
     http://localhost:3000/api/v1/admin/registry/merchants/merchant_123/currency-mappings
   ```

### Integration Testing

Once the contract is deployed:

1. Deploy updated contract with new functions
2. Update `MERCHANT_REGISTRY_CONTRACT_ID` in `.env`
3. Remove mock implementations from service methods
4. Test end-to-end flow with real contract calls

---

## Deployment Checklist

- [ ] Deploy updated Soroban contract with all 4 features
- [ ] Update contract ID in environment variables
- [ ] Set up IPFS node/gateway for #208
- [ ] Configure IPFS credentials in backend
- [ ] Remove mock implementations from service layer
- [ ] Run integration tests against deployed contract
- [ ] Update API documentation
- [ ] Monitor contract invocation costs
- [ ] Set up alerts for failed contract calls

---

## Future Enhancements

1. **IPFS Pinning Service**: Use Pinata or similar for reliable IPFS storage
2. **Caching Layer**: Cache frequently accessed merchant profiles
3. **Batch Operations**: Support bulk whitelist updates
4. **Webhook Notifications**: Notify merchants of whitelist/mapping changes
5. **Multi-sig Whitelist**: Require multiple approvals for whitelist changes
6. **Currency Auto-detection**: Suggest payout addresses based on settlement currency

---

## References

- [Stellar Soroban Documentation](https://soroban.stellar.org/docs)
- [IPFS Documentation](https://docs.ipfs.tech/)
- [FluxaPay Contract Repository](https://github.com/MetroLogic/fluxapay_contract)
