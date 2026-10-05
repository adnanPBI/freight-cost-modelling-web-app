-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR');

-- CreateEnum
CREATE TYPE "CommercialStatus" AS ENUM ('CONTRACTED_ACTIVE', 'CONTRACTED_EXPIRED', 'SUBMISSION_RESEARCH', 'SUPERSEDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RateCardStatus" AS ENUM ('FUTURE', 'ACTIVE', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AllocationKeyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AllocationPosition" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY', 'BACKUP_1', 'BACKUP_2');

-- CreateEnum
CREATE TYPE "ScenarioRuleType" AS ENUM ('CARRIER_REPLACEMENT', 'LANE_SPLIT', 'CUSTOMER_ASSIGNMENT', 'CUSTOMER_SPLIT');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('RATE_CARD', 'ALLOCATION_KEY', 'VOLUME', 'POSTCODE_MAPPING');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "AccessorialBasis" AS ENUM ('PER_SHIPMENT', 'PER_PALLET', 'PER_HOUR', 'FLAT', 'PERCENT_BASE');

-- CreateEnum
CREATE TYPE "PalletRounding" AS ENUM ('UP', 'NEAREST');

-- CreateEnum
CREATE TYPE "Above36Policy" AS ENUM ('FTL', 'SPLIT', 'ERROR');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "palletRounding" "PalletRounding" NOT NULL DEFAULT 'UP',
    "above36Policy" "Above36Policy" NOT NULL DEFAULT 'FTL',
    "maxPalletsPerFtl" INTEGER NOT NULL DEFAULT 33,
    "minContractedCarriers" INTEGER NOT NULL DEFAULT 2,
    "defaultExpiryHorizonDays" INTEGER NOT NULL DEFAULT 90,
    "requireFuelForCosting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeType" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarrierAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionCentre" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportMode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "palletBand" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lane" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dcId" TEXT NOT NULL,
    "modeId" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destinationRegion" TEXT NOT NULL,
    "laneIdentifier" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "dcId" TEXT NOT NULL,
    "modeId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "commercialStatus" "CommercialStatus" NOT NULL,
    "status" "RateCardStatus" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "uploadChecksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaneRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "baseRate" DECIMAL(12,2),
    "transitDays" DECIMAL(6,2),
    "assetModel" TEXT,
    "capacity" DECIMAL(12,2),
    "committedTrucks" DECIMAL(12,2),
    "sourceRow" INTEGER,
    "sourceMetadata" JSONB,

    CONSTRAINT "LaneRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalletBand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "laneRateId" TEXT NOT NULL,
    "palletQty" INTEGER NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PalletBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dcId" TEXT,
    "modeId" TEXT,
    "status" "AllocationKeyStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "changeNote" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceScenarioId" TEXT,
    "supersedesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allocationKeyId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "customerCode" TEXT,
    "destinationZip" TEXT,
    "position" "AllocationPosition" NOT NULL,
    "percentage" DECIMAL(7,4),
    "notes" TEXT,

    CONSTRAINT "AllocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "parsedData" JSONB,
    "overrides" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importJobId" TEXT,
    "dcId" TEXT NOT NULL,
    "modeId" TEXT NOT NULL,
    "laneId" TEXT,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destinationPostcode" TEXT NOT NULL,
    "normalizedPostcode" TEXT NOT NULL,
    "destinationRegion" TEXT,
    "shipmentCount" DECIMAL(14,2) NOT NULL,
    "palletCount" DECIMAL(14,2),
    "averagePallets" DECIMAL(12,4),
    "shipmentPalletQuantities" JSONB,
    "accessorialAssumptions" JSONB,
    "period" TEXT NOT NULL,
    "forecastVolume" DECIMAL(14,2),
    "notes" TEXT,
    "mappedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostcodeMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "destinationRegion" TEXT NOT NULL,
    "laneId" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostcodeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessorialType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultBasis" "AccessorialBasis" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessorialType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierAccessorial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "chargingBasis" "AccessorialBasis" NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "commercialStatus" "CommercialStatus" NOT NULL,
    "dcId" TEXT,
    "modeId" TEXT,
    "destinationCountry" TEXT,
    "laneId" TEXT,
    "rateCardId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierAccessorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelSurcharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "dcId" TEXT,
    "modeId" TEXT,
    "laneId" TEXT,
    "rateCardId" TEXT,
    "percentage" DECIMAL(8,4) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "modellingDate" TIMESTAMP(3) NOT NULL,
    "enablePalletToFtl" BOOLEAN NOT NULL DEFAULT false,
    "maxPalletsPerFtl" INTEGER NOT NULL DEFAULT 33,
    "promotedAllocationKeyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "type" "ScenarioRuleType" NOT NULL,
    "laneId" TEXT NOT NULL,
    "carrierId" TEXT,
    "replacementCarrierId" TEXT,
    "customerCode" TEXT,
    "percentage" DECIMAL(7,4),
    "notes" TEXT,

    CONSTRAINT "ScenarioRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantConfig_tenantId_key" ON "TenantConfig"("tenantId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EntityRevision_tenantId_entityType_entityId_idx" ON "EntityRevision"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRevision_tenantId_entityType_entityId_version_key" ON "EntityRevision"("tenantId", "entityType", "entityId", "version");

-- CreateIndex
CREATE INDEX "Carrier_tenantId_name_idx" ON "Carrier"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_tenantId_code_key" ON "Carrier"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CarrierAlias_tenantId_carrierId_idx" ON "CarrierAlias"("tenantId", "carrierId");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierAlias_tenantId_alias_key" ON "CarrierAlias"("tenantId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionCentre_tenantId_code_key" ON "DistributionCentre"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TransportMode_tenantId_code_key" ON "TransportMode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Lane_tenantId_destinationCountry_destinationRegion_idx" ON "Lane"("tenantId", "destinationCountry", "destinationRegion");

-- CreateIndex
CREATE UNIQUE INDEX "Lane_tenantId_dcId_modeId_destinationCountry_destinationReg_key" ON "Lane"("tenantId", "dcId", "modeId", "destinationCountry", "destinationRegion");

-- CreateIndex
CREATE INDEX "RateCard_tenantId_carrierId_dcId_modeId_validFrom_validTo_idx" ON "RateCard"("tenantId", "carrierId", "dcId", "modeId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "RateCard_tenantId_uploadChecksum_idx" ON "RateCard"("tenantId", "uploadChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "LaneRate_tenantId_rateCardId_laneId_key" ON "LaneRate"("tenantId", "rateCardId", "laneId");

-- CreateIndex
CREATE UNIQUE INDEX "PalletBand_tenantId_laneRateId_palletQty_key" ON "PalletBand"("tenantId", "laneRateId", "palletQty");

-- CreateIndex
CREATE INDEX "AllocationKey_tenantId_status_dcId_modeId_idx" ON "AllocationKey"("tenantId", "status", "dcId", "modeId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationKey_tenantId_displayKey_key" ON "AllocationKey"("tenantId", "displayKey");

-- CreateIndex
CREATE INDEX "AllocationRule_tenantId_allocationKeyId_laneId_customerCode_idx" ON "AllocationRule"("tenantId", "allocationKeyId", "laneId", "customerCode");

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_type_checksum_idx" ON "ImportJob"("tenantId", "type", "checksum");

-- CreateIndex
CREATE INDEX "VolumeRecord_tenantId_dcId_modeId_laneId_idx" ON "VolumeRecord"("tenantId", "dcId", "modeId", "laneId");

-- CreateIndex
CREATE INDEX "VolumeRecord_tenantId_customerCode_idx" ON "VolumeRecord"("tenantId", "customerCode");

-- CreateIndex
CREATE INDEX "PostcodeMapping_tenantId_countryCode_prefix_validFrom_valid_idx" ON "PostcodeMapping"("tenantId", "countryCode", "prefix", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "AccessorialType_tenantId_code_key" ON "AccessorialType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CarrierAccessorial_tenantId_carrierId_typeId_validFrom_vali_idx" ON "CarrierAccessorial"("tenantId", "carrierId", "typeId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "FuelSurcharge_tenantId_carrierId_validFrom_validTo_idx" ON "FuelSurcharge"("tenantId", "carrierId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_promotedAllocationKeyId_key" ON "Scenario"("promotedAllocationKeyId");

-- CreateIndex
CREATE INDEX "ScenarioRule_tenantId_scenarioId_laneId_customerCode_idx" ON "ScenarioRule"("tenantId", "scenarioId", "laneId", "customerCode");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_entityType_entityId_idx" ON "AuditEvent"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "TenantConfig" ADD CONSTRAINT "TenantConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRevision" ADD CONSTRAINT "EntityRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrier" ADD CONSTRAINT "Carrier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAlias" ADD CONSTRAINT "CarrierAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAlias" ADD CONSTRAINT "CarrierAlias_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionCentre" ADD CONSTRAINT "DistributionCentre_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportMode" ADD CONSTRAINT "TransportMode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "DistributionCentre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "TransportMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "DistributionCentre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "TransportMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaneRate" ADD CONSTRAINT "LaneRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaneRate" ADD CONSTRAINT "LaneRate_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaneRate" ADD CONSTRAINT "LaneRate_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalletBand" ADD CONSTRAINT "PalletBand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalletBand" ADD CONSTRAINT "PalletBand_laneRateId_fkey" FOREIGN KEY ("laneRateId") REFERENCES "LaneRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationKey" ADD CONSTRAINT "AllocationKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationKey" ADD CONSTRAINT "AllocationKey_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "DistributionCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationKey" ADD CONSTRAINT "AllocationKey_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "TransportMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationKey" ADD CONSTRAINT "AllocationKey_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AllocationKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_allocationKeyId_fkey" FOREIGN KEY ("allocationKeyId") REFERENCES "AllocationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeRecord" ADD CONSTRAINT "VolumeRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeRecord" ADD CONSTRAINT "VolumeRecord_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeRecord" ADD CONSTRAINT "VolumeRecord_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "DistributionCentre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeRecord" ADD CONSTRAINT "VolumeRecord_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "TransportMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeRecord" ADD CONSTRAINT "VolumeRecord_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcodeMapping" ADD CONSTRAINT "PostcodeMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcodeMapping" ADD CONSTRAINT "PostcodeMapping_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcodeMapping" ADD CONSTRAINT "PostcodeMapping_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PostcodeMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessorialType" ADD CONSTRAINT "AccessorialType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AccessorialType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "DistributionCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "TransportMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAccessorial" ADD CONSTRAINT "CarrierAccessorial_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CarrierAccessorial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "DistributionCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "TransportMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelSurcharge" ADD CONSTRAINT "FuelSurcharge_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "FuelSurcharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_promotedAllocationKeyId_fkey" FOREIGN KEY ("promotedAllocationKeyId") REFERENCES "AllocationKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRule" ADD CONSTRAINT "ScenarioRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRule" ADD CONSTRAINT "ScenarioRule_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRule" ADD CONSTRAINT "ScenarioRule_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRule" ADD CONSTRAINT "ScenarioRule_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRule" ADD CONSTRAINT "ScenarioRule_replacementCarrierId_fkey" FOREIGN KEY ("replacementCarrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
