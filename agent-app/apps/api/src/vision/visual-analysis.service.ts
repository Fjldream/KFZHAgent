// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { canonicalServerHash, VisualReferenceSpecSchema, type ModelRoute, type VisualReferenceSpec } from "@kf/contracts";
import type { VisualReferenceAnalysis } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ModelTransportError } from "../models/deepseek-transport.js";
import type { ModelGateway } from "../models/model-gateway.js";
import { validateModelRoute } from "../models/model-config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReferenceAssetService } from "./reference-asset.service.js";
import { buildVisualAnalysisRequest, VISUAL_ANALYSIS_VERSION, visualModelConfigHash } from "./visual-analysis-request.js";
import { visualAnalysisCacheKey } from "./visual-analysis-cache.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { lockActiveVisualRun, pinVisualAnalysisInput, resolveVisualAnalysisRoute } from "./visual-analysis-input.js";
import { withAgentRunNode } from "@kf/build-jobs";
// end

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export type VisualAnalysisInput = { tenantId: string; workspaceId: string; runId: string; assetId: string; instruction: string; analysisVersion: string };
export type VisualAnalysisResult = { id: string; specHash: string; spec: VisualReferenceSpec; reused: boolean; modelConfigHash: string };

/** Internal Run-step service, not a public endpoint that can trigger provider calls. */
export class VisualAnalysisService {
  private readonly route: ModelRoute;
  constructor(private readonly prisma: PrismaService, private readonly references: ReferenceAssetService,
    private readonly gateway: ModelGateway, route: ModelRoute) { this.route = structuredClone(route); }

  async analyze(input: VisualAnalysisInput, signal: AbortSignal): Promise<VisualAnalysisResult> {
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    abortIfNeeded(signal);
    return withAgentRunNode(() => this.analyzeInRun(input, signal));
  }

  private async analyzeInRun(input: VisualAnalysisInput, signal: AbortSignal): Promise<VisualAnalysisResult> {
    // end
    abortIfNeeded(signal);
    if (input.analysisVersion !== VISUAL_ANALYSIS_VERSION || typeof input.instruction !== "string") throw new BadRequestException("VISUAL_INPUT_INVALID");
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    const { run, route } = await this.prisma.$transaction(async tx => {
      const run = await lockActiveVisualRun(tx, input);
      return { run, route: await resolveVisualAnalysisRoute(tx, run, input, this.route) };
    });
    // end
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { imageEgressAllowed: true } });
    if (tenant?.imageEgressAllowed !== true) throw new ForbiddenException("IMAGE_EGRESS_NOT_ALLOWED");
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    validateModelRoute(route, "vision");
    if (!Number.isSafeInteger(route.timeoutMs) || route.timeoutMs < 1 || route.timeoutMs > 120000) throw new BadRequestException("VISUAL_ROUTE_INVALID");
    // end
    const image = await this.references.resolve(input.tenantId, input.workspaceId, input.assetId);
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    const request = buildVisualAnalysisRequest({ ...input, image, route, conversationId: run.conversationId });
    const modelConfigHash = visualModelConfigHash(route);
    // end
    const instructionHash = canonicalServerHash(input.instruction);
    const cacheKey = visualAnalysisCacheKey({ tenantId: input.tenantId, workspaceId: input.workspaceId, assetId: input.assetId,
      sourceHash: image.sourceHash, derivativeHash: image.derivativeHash, analysisVersion: input.analysisVersion, modelConfigHash, instructionHash });
    const now = new Date();
    const leaseOwner = randomUUID();
    // No DB transaction/connection is held while the provider is running.
    const cached = await this.prisma.$transaction(async tx => {
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      const active = await lockActiveVisualRun(tx, input);
      await pinVisualAnalysisInput(tx, active, input, image, modelConfigHash);
      // end
      await tx.visualAnalysisCacheEntry.upsert({ where: { cacheKey }, create: { cacheKey, tenantId: input.tenantId, workspaceId: input.workspaceId }, update: {} });
      const rows = await tx.$queryRaw<{ cacheKey: string }[]>`SELECT "cacheKey" FROM "VisualAnalysisCacheEntry"
        WHERE "cacheKey" = ${cacheKey} AND "tenantId" = ${input.tenantId} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException("visual analysis");
      const entry = await tx.visualAnalysisCacheEntry.findUniqueOrThrow({ where: { cacheKey }, include: { analysis: true } });
      if (entry.analysis?.status === "VALID" && entry.analysis.expiresAt > now) {
        const analysis = entry.analysis;
        if (analysis.assetId !== input.assetId || analysis.sourceHash !== image.sourceHash || analysis.derivativeHash !== image.derivativeHash ||
          analysis.modelConfigHash !== modelConfigHash || analysis.instructionHash !== instructionHash || analysis.analysisVersion !== input.analysisVersion) {
          throw new UnprocessableEntityException("VISUAL_ANALYSIS_INTEGRITY_FAILED");
        }
        return analysis;
      }
      if (entry.leaseOwner !== null && entry.leaseExpiresAt !== null && entry.leaseExpiresAt > now) throw new ConflictException("VISUAL_ANALYSIS_IN_PROGRESS");
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      await tx.visualAnalysisCacheEntry.update({ where: { cacheKey }, data: { leaseOwner, leaseExpiresAt: new Date(now.getTime() + route.timeoutMs + 30000) } });
      // end
      return null;
    });
    if (cached) return resultOf(cached, true);
    try {
      // A tenant administrator can revoke egress after image loading/lease acquisition.
      abortIfNeeded(signal);
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      await this.prisma.$transaction(async tx => {
        const active = await lockActiveVisualRun(tx, input);
        await pinVisualAnalysisInput(tx, active, input, image, modelConfigHash);
      });
      // end
      if (!(await this.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { imageEgressAllowed: true } }))?.imageEgressAllowed) {
        throw new ForbiddenException("IMAGE_EGRESS_NOT_ALLOWED");
      }
      const reply = await this.gateway.completeJson({ ...request, signal });
      abortIfNeeded(signal);
      if (reply.finishReason === "length") throw new UnprocessableEntityException("VISUAL_ANALYSIS_INVALID");
      let spec: VisualReferenceSpec;
      try {
        // Validate the entire untrusted shape before replacing the model's invented source facts.
        const parsed = VisualReferenceSpecSchema.parse(JSON.parse(reply.text) as unknown);
        spec = VisualReferenceSpecSchema.parse({ ...parsed, sourceAssetId: image.assetId, sourceHash: image.sourceHash,
          viewport: { width: image.width, height: image.height } });
      } catch { throw new UnprocessableEntityException("VISUAL_ANALYSIS_INVALID"); }
      const row = await this.prisma.$transaction(async tx => {
        abortIfNeeded(signal);
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        const active = await lockActiveVisualRun(tx, input);
        await pinVisualAnalysisInput(tx, active, input, image, modelConfigHash);
        // end
        const created = await tx.visualReferenceAnalysis.create({ data: {
          tenantId: input.tenantId, workspaceId: input.workspaceId, assetId: input.assetId, sourceHash: image.sourceHash,
          derivativeHash: image.derivativeHash, analysisVersion: input.analysisVersion, modelConfigHash, instructionHash,
          status: "VALID", spec, specHash: canonicalServerHash(spec), expiresAt: new Date(Date.now() + CACHE_TTL_MS),
        } });
        const published = await tx.visualAnalysisCacheEntry.updateMany({ where: { cacheKey, tenantId: input.tenantId, leaseOwner, leaseExpiresAt: { gt: new Date() } },
          data: { analysisId: created.id, leaseOwner: null, leaseExpiresAt: null } });
        if (published.count !== 1) throw new ConflictException("VISUAL_ANALYSIS_LEASE_LOST");
        return created;
      });
      return resultOf(row, false);
    } catch (error) {
      // Never leak a provider's response, private path, prompt, image or credentials into REST/events.
      if (error instanceof ModelTransportError) throw new UnprocessableEntityException(error.code);
      throw error;
    } finally {
      await this.prisma.visualAnalysisCacheEntry.updateMany({ where: { cacheKey, tenantId: input.tenantId, leaseOwner },
        data: { leaseOwner: null, leaseExpiresAt: null } }).catch(() => undefined);
    }
  }

  async get(tenantId: string, analysisId: string): Promise<VisualAnalysisResult> {
    const row = await this.prisma.visualReferenceAnalysis.findFirst({ where: { id: analysisId, tenantId, status: "VALID" } });
    if (!row) throw new NotFoundException("visual analysis");
    return resultOf(row, false);
  }

  async revise(tenantId: string, analysisId: string, expectedHash: string, input: VisualReferenceSpec): Promise<VisualAnalysisResult> {
    const row = await this.prisma.visualReferenceAnalysis.findFirst({ where: { id: analysisId, tenantId, status: "VALID" } });
    if (!row) throw new NotFoundException("visual analysis");
    const before = resultOf(row, false);
    if (expectedHash !== row.specHash) throw new ConflictException("VISUAL_ANALYSIS_STALE");
    const parsed = VisualReferenceSpecSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("VISUAL_ANALYSIS_INVALID");
    const frozen = (spec: VisualReferenceSpec) => ({ schemaVersion: spec.schemaVersion, sourceAssetId: spec.sourceAssetId,
      sourceHash: spec.sourceHash, viewport: spec.viewport, regions: spec.regions.map(region => ({
        id: region.id, parentId: region.parentId, confidence: region.confidence, interactionHint: region.interactionHint })) });
    if (canonicalServerHash(frozen(before.spec)) !== canonicalServerHash(frozen(parsed.data))) throw new BadRequestException("VISUAL_SOURCE_IMMUTABLE");
    try {
      const revised = await this.prisma.visualReferenceAnalysis.create({ data: {
        tenantId, workspaceId: row.workspaceId, assetId: row.assetId, sourceHash: row.sourceHash, derivativeHash: row.derivativeHash,
        analysisVersion: row.analysisVersion, modelConfigHash: row.modelConfigHash, instructionHash: row.instructionHash,
        spec: parsed.data, specHash: canonicalServerHash(parsed.data), parentId: row.id, expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      } });
      return resultOf(revised, false);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("VISUAL_ANALYSIS_STALE");
      throw error;
    }
  }
}

function resultOf(row: VisualReferenceAnalysis, reused: boolean): VisualAnalysisResult {
  const parsed = VisualReferenceSpecSchema.safeParse(row.spec);
  if (!parsed.success || parsed.data.sourceAssetId !== row.assetId || parsed.data.sourceHash !== row.sourceHash ||
    canonicalServerHash(parsed.data) !== row.specHash) throw new UnprocessableEntityException("VISUAL_ANALYSIS_INTEGRITY_FAILED");
  return { id: row.id, specHash: row.specHash, spec: parsed.data, modelConfigHash: row.modelConfigHash, reused };
}
function abortIfNeeded(signal: AbortSignal): void { if (signal.aborted) throw new BadRequestException("MODEL_CANCELLED"); }
function isUniqueViolation(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
// end
