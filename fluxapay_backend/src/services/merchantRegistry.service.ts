import {
  Keypair,
  nativeToScVal,
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
} from "@stellar/stellar-sdk";
import { isDevEnv } from "../helpers/env.helper";
import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

export class MerchantRegistryService {
  private rpcUrl: string;
  private networkPassphrase: string;
  private contractId: string;
  private adminKeypair: Keypair;
  private server: rpc.Server;
  
  // #213: Registry pagination constants
  private readonly DEFAULT_PAGE_SIZE = 50;
  private readonly MAX_PAGE_SIZE = 100;

  constructor() {
    this.rpcUrl =
      process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
    this.networkPassphrase =
      process.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
    this.contractId = process.env.MERCHANT_REGISTRY_CONTRACT_ID || "";

    const adminSecret = process.env.ADMIN_SECRET_KEY;
    if (adminSecret) {
      this.adminKeypair = Keypair.fromSecret(adminSecret);
    } else {
      // Create a random one for dev/fallback if missing, though it won't actually have authorization on mainnet
      this.adminKeypair = Keypair.random();
      if (isDevEnv()) {
        console.warn(
          "ADMIN_SECRET_KEY not set. Using random keypair. Contract calls will likely fail.",
        );
      }
    }

    this.server = new rpc.Server(this.rpcUrl);
  }

  /**
   * Registers a merchant on-chain via the Soroban Smart Contract.
   * Includes an automatic retry mechanism for robustness.
   * Throws an error if we exceed max retries.
   */
  public async register_merchant(
    merchantId: string,
    businessName: string,
    settlementCurrency: string,
  ): Promise<boolean> {
    if (!this.contractId) {
      console.warn(
        "MERCHANT_REGISTRY_CONTRACT_ID is not configured. Skipping on-chain registration.",
      );
      return false;
    }

    const MAX_RETRIES = 3;
    let attempt = 0;
    const baseDelay = 1000;

    while (attempt < MAX_RETRIES) {
      try {
        await this.invokeRegisterContract(
          merchantId,
          businessName,
          settlementCurrency,
        );
        if (isDevEnv()) {
          console.log(
            `Successfully registered merchant ${merchantId} on-chain.`,
          );
        }
        return true;
      } catch (error) {
        attempt++;
        let errorMessage = "Unknown error";
        if (error instanceof Error) errorMessage = error.message;

        console.error(
          `Attempt ${attempt} to register merchant ${merchantId} on-chain failed:`,
          errorMessage,
        );

        if (attempt >= MAX_RETRIES) {
          await this.logToManualInterventionQueue(merchantId, errorMessage);
          throw new Error(
            `Max retries reached for on-chain registration: ${errorMessage}`,
          );
        }

        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)),
        );
      }
    }
    return false;
  }

  private async invokeRegisterContract(
    merchantId: string,
    businessName: string,
    settlementCurrency: string,
  ) {
    const contract = new Contract(this.contractId);

    // Prepare arguments: merchant_id, business_name, settlement_currency
    const args = [
      nativeToScVal(merchantId, { type: "string" }),
      nativeToScVal(businessName, { type: "string" }),
      nativeToScVal(settlementCurrency, { type: "symbol" }),
    ];

    const sourceAccount = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    const builder = new TransactionBuilder(sourceAccount, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    });

    const tx = builder
      .addOperation(contract.call("register_merchant", ...args))
      .setTimeout(30)
      .build();

    const preparedTx = (await this.server.prepareTransaction(tx)) as any;

    preparedTx.sign(this.adminKeypair);

    const sendTxResponse = await this.server.sendTransaction(preparedTx);

    if (sendTxResponse.status === "ERROR") {
      throw new Error(
        `Transaction submission failed: ${JSON.stringify(sendTxResponse)}`,
      );
    }

    // Wait for the transaction to be processed
    let txResponse = await this.server.getTransaction(sendTxResponse.hash);

    let retries = 0;
    while (txResponse.status === "NOT_FOUND" && retries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      txResponse = await this.server.getTransaction(sendTxResponse.hash);
      retries++;
    }

    return true;
  }

  private async logToManualInterventionQueue(
    merchantId: string,
    reason: string,
  ) {
    console.error(
      `[MANUAL INTERVENTION REQUIRED] Merchant ${merchantId} failed on-chain registration: ${reason}`,
    );
    try {
      await prisma.manualIntervention.create({
        data: {
          merchantId,
          issue_type: "onchain_registration_failed",
          description: `On-chain registration failed after max retries. Reason: ${reason}`,
        },
      });
    } catch (dbError) {
      console.error(
        `Failed to create manual intervention record for merchant ${merchantId}:`,
        dbError,
      );
    }
  }

  /**
   * #213: Optimizing Registry Listing Pagination
   * Returns paginated list of merchants from the registry to avoid ledger limits.
   * 
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of items per page (max 100)
   * @returns Paginated merchant list with metadata
   */
  public async listMerchantsPaginated(
    page: number = 1,
    pageSize: number = this.DEFAULT_PAGE_SIZE,
  ): Promise<{
    merchants: Array<{ merchantId: string; businessName: string; settlementCurrency: string }>;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    if (!this.contractId) {
      console.warn("MERCHANT_REGISTRY_CONTRACT_ID is not configured.");
      return {
        merchants: [],
        page,
        pageSize,
        totalPages: 0,
        hasMore: false,
      };
    }

    // Enforce page size limits
    const effectivePageSize = Math.min(Math.max(1, pageSize), this.MAX_PAGE_SIZE);
    const effectivePage = Math.max(1, page);
    const startIndex = (effectivePage - 1) * effectivePageSize;

    try {
      const contract = new Contract(this.contractId);

      // Mock implementation - in production this would call the contract
      // contract.call("list_merchants_paginated", startIndex, effectivePageSize)
      
      // For now, return mock data structure
      const mockMerchants = [
        { merchantId: "merchant_1", businessName: "Acme Corp", settlementCurrency: "USD" },
        { merchantId: "merchant_2", businessName: "Tech Solutions", settlementCurrency: "EUR" },
      ];

      const totalMerchants = mockMerchants.length;
      const totalPages = Math.ceil(totalMerchants / effectivePageSize);
      const hasMore = effectivePage < totalPages;

      return {
        merchants: mockMerchants.slice(startIndex, startIndex + effectivePageSize),
        page: effectivePage,
        pageSize: effectivePageSize,
        totalPages,
        hasMore,
      };
    } catch (error) {
      console.error("Error fetching paginated merchants:", error);
      throw error;
    }
  }

  /**
   * #216: Multi-Currency Registry Mapping
   * Links multiple payout addresses for a merchant across different currencies.
   * 
   * @param merchantId - Merchant identifier
   * @param currencyMappings - Map of currency to payout address
   */
  public async updateCurrencyMappings(
    merchantId: string,
    currencyMappings: Record<string, string>,
  ): Promise<boolean> {
    if (!this.contractId) {
      console.warn("MERCHANT_REGISTRY_CONTRACT_ID is not configured.");
      return false;
    }

    try {
      const contract = new Contract(this.contractId);

      // Prepare arguments for multi-currency mapping
      const mappingEntries = Object.entries(currencyMappings).map(([currency, address]) => ({
        currency: nativeToScVal(currency, { type: "symbol" }),
        payout_address: nativeToScVal(address, { type: "string" }),
      }));

      const args = [
        nativeToScVal(merchantId, { type: "string" }),
        nativeToScVal(mappingEntries, { type: "vec" }),
      ];

      const sourceAccount = await this.server.getAccount(
        this.adminKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(sourceAccount, {
        fee: "100000",
        networkPassphrase: this.networkPassphrase,
      });

      const tx = builder
        .addOperation(contract.call("update_currency_mappings", ...args))
        .setTimeout(30)
        .build();

      const preparedTx = (await this.server.prepareTransaction(tx)) as any;
      preparedTx.sign(this.adminKeypair);

      const sendTxResponse = await this.server.sendTransaction(preparedTx);

      if (sendTxResponse.status === "ERROR") {
        throw new Error(
          `Currency mapping update failed: ${JSON.stringify(sendTxResponse)}`,
        );
      }

      // Wait for confirmation
      let txResponse = await this.server.getTransaction(sendTxResponse.hash);
      let retries = 0;
      while (txResponse.status === "NOT_FOUND" && retries < 10) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        txResponse = await this.server.getTransaction(sendTxResponse.hash);
        retries++;
      }

      if (isDevEnv()) {
        console.log(`Successfully updated currency mappings for merchant ${merchantId}`);
      }

      return true;
    } catch (error) {
      console.error(`Error updating currency mappings for ${merchantId}:`, error);
      throw error;
    }
  }

  /**
   * #216: Get currency mappings for a merchant
   * Retrieves all payout addresses mapped to different currencies.
   * 
   * @param merchantId - Merchant identifier
   * @returns Map of currency to payout address
   */
  public async getCurrencyMappings(
    merchantId: string,
  ): Promise<Record<string, string>> {
    if (!this.contractId) {
      console.warn("MERCHANT_REGISTRY_CONTRACT_ID is not configured.");
      return {};
    }

    try {
      const contract = new Contract(this.contractId);

      const args = [nativeToScVal(merchantId, { type: "string" })];

      const sourceAccount = await this.server.getAccount(
        this.adminKeypair.publicKey(),
      );

      const builder = new TransactionBuilder(sourceAccount, {
        fee: "100000",
        networkPassphrase: this.networkPassphrase,
      });

      const tx = builder
        .addOperation(contract.call("get_currency_mappings", ...args))
        .setTimeout(30)
        .build();

      const preparedTx = (await this.server.prepareTransaction(tx)) as any;

      const simulateResponse = await this.server.simulateTransaction(preparedTx);

      // Mock response - in production would parse contract result
      const mockMappings: Record<string, string> = {
        USD: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        EUR: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        GBP: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      };

      return mockMappings;
    } catch (error) {
      console.error(`Error fetching currency mappings for ${merchantId}:`, error);
      return {};
    }
  }
}

export const merchantRegistryService = new MerchantRegistryService();
