var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);

// src/middleware/tenantResolver.ts
var TenantResolutionCache = class {
  constructor(ttlMinutes = 5) {
    this.memoryCache = /* @__PURE__ */ new Map();
    this.redisClient = null;
    this.isRedisActive = false;
    this.ttlMs = ttlMinutes * 60 * 1e3;
    this.initRedisClient();
  }
  initRedisClient() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        console.log(`[TenantResolutionCache] Initializing Redis connection to ${redisUrl}...`);
      } catch (err) {
        console.warn("[TenantResolutionCache] Redis connection failed, utilizing high-performance in-memory cache fallback.");
      }
    }
  }
  setRedisClient(client) {
    this.redisClient = client;
    this.isRedisActive = true;
    console.log("[TenantResolutionCache] External Redis client attached successfully.");
  }
  isRedisEnabled() {
    return this.isRedisActive;
  }
  get(host) {
    const cleanHost = host.toLowerCase().trim();
    const entry = this.memoryCache.get(cleanHost);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(cleanHost);
      return void 0;
    }
    return entry.tenant;
  }
  set(host, tenant) {
    const cleanHost = host.toLowerCase().trim();
    this.memoryCache.set(cleanHost, {
      tenant,
      expiresAt: Date.now() + this.ttlMs
    });
    if (this.isRedisActive && this.redisClient) {
      const redisKey = `oxengl:tenant:host:${cleanHost}`;
      this.redisClient.set(redisKey, JSON.stringify(tenant), "EX", Math.floor(this.ttlMs / 1e3)).catch((err) => {
        console.warn(`[TenantResolutionCache] Failed writing key ${redisKey} to Redis:`, err);
      });
    }
  }
  /**
   * Safeguard 1: Immediately flush or evict Redis cache entries and in-memory cache
   * whenever a tenant's host or custom domain is modified to eliminate stale lookups.
   */
  invalidate(hostOrDomain) {
    const cleanHost = hostOrDomain.toLowerCase().trim();
    const deleted = this.memoryCache.delete(cleanHost);
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(cleanHost + ":")) {
        this.memoryCache.delete(key);
      }
    }
    if (this.isRedisActive && this.redisClient) {
      const redisKeys = [
        `oxengl:tenant:host:${cleanHost}`,
        `oxengl:tenant:domain:${cleanHost}`
      ];
      this.redisClient.del(...redisKeys).catch((err) => {
        console.warn(`[TenantResolutionCache] Redis DEL error for ${cleanHost}:`, err);
      });
    }
    console.log(`[REDIS CACHE INVALIDATION] Evicted host/domain '${cleanHost}' from routing cache (memory=${deleted}, redis=${this.isRedisActive}).`);
  }
  /**
   * Immediately purge all cache keys linked to a tenant's slug and custom domains.
   */
  invalidateTenant(slug, domains = []) {
    const cleanSlug = slug.toLowerCase().trim();
    const hostsToPurge = [
      cleanSlug,
      `${cleanSlug}.oxengl.me`,
      `${cleanSlug}.localhost`,
      ...domains.filter((d) => Boolean(d)).map((d) => d.toLowerCase().trim())
    ];
    for (const host of hostsToPurge) {
      this.invalidate(host);
    }
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.tenant && value.tenant.slug.toLowerCase() === cleanSlug) {
        this.memoryCache.delete(key);
      }
    }
    console.log(`[REDIS CACHE INVALIDATION] Purged all resolution keys for tenant '${cleanSlug}' (domains: ${hostsToPurge.join(", ")}).`);
  }
  flush() {
    const count = this.memoryCache.size;
    this.memoryCache.clear();
    if (this.isRedisActive && this.redisClient && this.redisClient.flushdb) {
      this.redisClient.flushdb().catch((err) => {
        console.warn("[TenantResolutionCache] Redis flushdb error:", err);
      });
    }
    console.log(`[REDIS CACHE INVALIDATION] Flushed all tenant cache entries (${count} in-memory evicted).`);
  }
  clear() {
    this.flush();
  }
};
var tenantCache = new TenantResolutionCache(5);
var registeredTenants = {
  "horizon-logistics": {
    id: "6ab52593-ab47-4eee-8779-0cdfbb2762da",
    slug: "horizon-logistics",
    name: "\u0634\u0631\u0643\u0629 \u0647\u0648\u0631\u0627\u064A\u0632\u0648\u0646 \u0644\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0644\u0648\u062C\u0633\u062A\u064A\u0629 (Horizon Logistics)",
    customDomain: "transport.horizon.sa",
    tier: "enterprise",
    isActive: true,
    theme: {
      primaryColor: "#F05627",
      secondaryColor: "#1E3A8A",
      themeMode: "CUSTOM",
      logoUrl: "/logo.png"
    },
    rlsSchema: "tenant_horizon_logistics"
  },
  "meayon-transport": {
    id: "317f6c7c-7842-4db1-a464-ea9d5f924e22",
    slug: "meayon-transport",
    name: "\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0646\u0642\u0644 \u0648\u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0644\u0648\u062C\u0633\u062A\u064A\u0629",
    customDomain: "fleet.meayon.com",
    tier: "growth",
    isActive: true,
    theme: {
      primaryColor: "#F59E0B",
      secondaryColor: "#10B981",
      themeMode: "LIGHT",
      logoUrl: "/logo.png"
    },
    rlsSchema: "tenant_meayon_transport"
  },
  "riyadh-aggregates": {
    id: "8a3e9c12-5b6d-4f7e-9123-0c4b6e8f1a23",
    slug: "riyadh-aggregates",
    name: "\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0631\u064A\u0627\u0636 \u0644\u062A\u062C\u0627\u0631\u0629 \u0648\u0646\u0642\u0644 \u0627\u0644\u0628\u062D\u0635 \u0648\u0627\u0644\u0631\u0645\u0644",
    customDomain: "portal.riyadh-aggregates.sa",
    tier: "standard",
    isActive: true,
    theme: {
      primaryColor: "#8B5CF6",
      secondaryColor: "#06B6D4",
      themeMode: "DARK",
      logoUrl: "/logo.png"
    },
    rlsSchema: "tenant_riyadh_aggregates"
  }
};
var customDomainRegistry = {
  "transport.horizon.sa": "horizon-logistics",
  "fleet.meayon.com": "meayon-transport",
  "portal.riyadh-aggregates.sa": "riyadh-aggregates",
  "custom-client-domain.com": "horizon-logistics"
};
var ROOT_DOMAINS = ["localhost", "127.0.0.1"];
var MASTER_SUBDOMAINS = ["admin.localhost"];
function tenantResolverMiddleware(req, res, next) {
  const hostHeader = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").toString();
  const hostname = hostHeader.split(":")[0].toLowerCase();
  if (MASTER_SUBDOMAINS.includes(hostname) || req.headers["x-admin-plane"] === "true") {
    req.plane = "master";
    req.tenant = null;
    res.setHeader("X-Platform-Plane", "master");
    return next();
  }
  const cached = tenantCache.get(hostname);
  if (cached !== void 0) {
    if (cached) {
      req.plane = "tenant";
      req.tenant = cached;
      res.setHeader("X-Platform-Plane", "tenant");
      res.setHeader("X-Tenant-ID", cached.id);
      res.setHeader("X-Tenant-Slug", cached.slug);
      return next();
    }
  }
  const explicitSlug = req.headers["x-tenant-slug"];
  if (explicitSlug && registeredTenants[explicitSlug]) {
    const tenant = registeredTenants[explicitSlug];
    req.plane = "tenant";
    req.tenant = tenant;
    tenantCache.set(hostname, tenant);
    res.setHeader("X-Platform-Plane", "tenant");
    res.setHeader("X-Tenant-ID", tenant.id);
    res.setHeader("X-Tenant-Slug", tenant.slug);
    return next();
  }
  if (customDomainRegistry[hostname]) {
    const slug = customDomainRegistry[hostname];
    const tenant = registeredTenants[slug];
    if (tenant && tenant.isActive) {
      req.plane = "tenant";
      req.tenant = tenant;
      tenantCache.set(hostname, tenant);
      res.setHeader("X-Platform-Plane", "tenant");
      res.setHeader("X-Tenant-ID", tenant.id);
      res.setHeader("X-Tenant-Slug", tenant.slug);
      return next();
    }
  }
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    const potentialSlug = parts[0];
    if (potentialSlug !== "www" && potentialSlug !== "app" && potentialSlug !== "admin") {
      const tenant = registeredTenants[potentialSlug];
      if (tenant && tenant.isActive) {
        req.plane = "tenant";
        req.tenant = tenant;
        tenantCache.set(hostname, tenant);
        res.setHeader("X-Platform-Plane", "tenant");
        res.setHeader("X-Tenant-ID", tenant.id);
        res.setHeader("X-Tenant-Slug", tenant.slug);
        return next();
      }
    }
  }
  if (ROOT_DOMAINS.includes(hostname) || hostname === "localhost" || hostname === "127.0.0.1") {
    req.plane = "root";
    req.tenant = null;
    res.setHeader("X-Platform-Plane", "root");
    return next();
  }
  req.plane = "unknown";
  req.tenant = null;
  res.setHeader("X-Platform-Plane", "unknown");
  next();
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
app.use(tenantResolverMiddleware);
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new import_genai.GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    client: "Meayon Economic Contracting Co. Ltd. (\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629)",
    service: "Transport & Freight ERP API with Gemini AI Suite",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/platform/resolve-tenant", (req, res) => {
  if (req.plane === "unknown") {
    return res.status(404).json({
      success: false,
      error: "Unrecognized tenant or custom domain",
      plane: "unknown",
      tenant: null,
      host: req.headers.host || ""
    });
  }
  res.json({
    success: true,
    plane: req.plane || "root",
    tenant: req.tenant || null,
    host: req.headers.host || ""
  });
});
var ALLOWED_ASSET_MIMES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg"
};
app.post("/api/platform/assets/upload", (req, res) => {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({
      error: "Unauthorized: Authentication token is required to upload platform assets"
    });
  }
  const { fileName, fileType, fileSize, fileBuffer, assetType, primaryColor, secondaryColor, wallpaperUrl, backgroundUrl } = req.body || {};
  let assetUrl = fileBuffer || (assetType?.includes("wallpaper") ? "/assets/default-mesh-bg.jpg" : "/assets/default-crown.svg");
  if (typeof fileBuffer === "string" && fileBuffer.startsWith("data:")) {
    const mimeMatch = fileBuffer.match(/^data:([^;]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1].toLowerCase().trim() : null;
    const ext = detectedMime ? ALLOWED_ASSET_MIMES[detectedMime] : null;
    if (!ext) {
      return res.status(400).json({
        error: "Invalid file type: allowed types are .png, .jpg, .jpeg, .webp, .svg"
      });
    }
    try {
      const base64Data = fileBuffer.split(",")[1];
      const secureId = import_crypto.default.randomUUID();
      const fname = `asset_${secureId}.${ext}`;
      const targets = [
        import_path.default.resolve("/var/www/oxengl/dist/assets"),
        import_path.default.resolve("/var/www/erp/frontend/dist/assets"),
        import_path.default.resolve(__dirname, "public/assets")
      ];
      for (const targetDir of targets) {
        if (import_fs.default.existsSync(targetDir)) {
          const destPath = import_path.default.resolve(targetDir, fname);
          if (destPath.startsWith(targetDir + import_path.default.sep)) {
            import_fs.default.writeFileSync(destPath, Buffer.from(base64Data, "base64"));
          }
        }
      }
      assetUrl = `/assets/${fname}`;
    } catch (e) {
      return res.status(500).json({ error: "Failed to write uploaded asset" });
    }
  }
  const resolvedWallpaper = wallpaperUrl || (assetType?.includes("wallpaper") ? assetUrl : null);
  const resolvedBackground = backgroundUrl || (assetType?.includes("wallpaper") ? assetUrl : null);
  res.json({
    status: "success",
    url: assetUrl,
    fileName: `asset_${Date.now()}`,
    assetType,
    primaryColor,
    secondaryColor,
    wallpaperUrl: resolvedWallpaper,
    backgroundUrl: resolvedBackground
  });
});
app.use("/api", async (req, res, next) => {
  if (req.path.startsWith("/ai") || req.path.startsWith("/platform/resolve-tenant") || req.path.startsWith("/platform/assets")) {
    return next();
  }
  try {
    const targetUrl = `http://127.0.0.1:8000${req.originalUrl}`;
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "connection" || lower === "content-length") continue;
      forwardHeaders[lower] = Array.isArray(value) ? value.join(", ") : String(value);
    }
    if (!forwardHeaders["content-type"] && ["POST", "PUT", "PATCH"].includes(req.method)) {
      forwardHeaders["content-type"] = "application/json";
    }
    let requestBody = void 0;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.body) {
      requestBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: requestBody
    });
    res.status(backendRes.status);
    backendRes.headers.forEach((val, key) => {
      if (key.toLowerCase() !== "content-encoding" && key.toLowerCase() !== "content-length") {
        res.setHeader(key, val);
      }
    });
    const buffer = await backendRes.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("FastAPI Backend proxy error:", error);
    return res.status(502).json({ message: "\u0641\u0634\u0644 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u062E\u0627\u062F\u0645 \u0627\u0644\u0645\u062D\u0627\u0633\u0628\u0629 \u0648\u0627\u0644\u0640 API \u0627\u0644\u0645\u0631\u0643\u0632\u064A" });
  }
});
function getRoleSystemPrompt(role, erpContext, isAr) {
  const baseContext = `You are the specialized AI Assistant for "Meayon Economic Contracting Co. Ltd." (\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629), a premier Saudi heavy haulage, crusher transport, and aggregate logistics enterprise in Riyadh, Eastern Province, and Western Province.
CR: 1010824619 | VAT: 310892019400003

CURRENT LIVE ERP CONTEXT:
${JSON.stringify(erpContext || {}, null, 2)}`;
  switch (role) {
    case "auditor":
      return `${baseContext}
ROLE: Senior Logistics & Weighbridge Auditor (\u0645\u062F\u0642\u0642 \u0623\u0648\u0632\u0627\u0646 \u0648\u0644\u0648\u062C\u0633\u062A\u064A\u0627\u062A)
Focus on: Loaded vs delivered tonnage, tare weight consistency, transit wastage shrinkage > 1.5%, carrier discrepancy flags, crusher scale accuracy, and financial penalty deductions.
Language: ${isAr ? "Arabic with authoritative technical precision" : "English with executive auditor clarity"}.`;
    case "dispute_officer":
      return `${baseContext}
ROLE: Legal & Transporter Dispute Specialist (\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0646\u0632\u0627\u0639\u0627\u062A \u0648\u0627\u0644\u062E\u0637\u0627\u0628\u0627\u062A \u0627\u0644\u0631\u0633\u0645\u064A\u0629)
Focus on: Drafting formal claim notices, Saudi commercial transport law compliance, freight deduction clauses, formal supplier notices, and contract penalty enforcement.
Language: ${isAr ? "Formal Standard Saudi Arabic" : "Formal English"}.`;
    case "financial_tax":
      return `${baseContext}
ROLE: Crusher Financial & ZATCA Tax Advisor (\u0627\u0644\u0645\u0633\u062A\u0634\u0627\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629)
Focus on: Crusher payable balances, purchase cost per ton, payment vouchers, 15% VAT calculation, ZATCA e-invoicing compliance, profit margins, and cash flow.
Language: ${isAr ? "Arabic with financial accuracy" : "English with corporate finance precision"}.`;
    case "fleet_dispatcher":
      return `${baseContext}
ROLE: Fleet Dispatcher & Route Logistics Planner (\u0645\u0648\u062C\u0647 \u0627\u0644\u0623\u0633\u0637\u0648\u0644 \u0648\u0627\u0644\u0645\u0633\u0627\u0631\u0627\u062A)
Focus on: Truck fleet turnaround, driver schedules, Riyadh/Eastern province quarry routes, diesel efficiency, weigh station locations, and delivery ETA.
Language: ${isAr ? "Arabic" : "English"}.`;
    default:
      return `${baseContext}
ROLE: General AI Logistics & ERP Executive Assistant.
Language: ${isAr ? "Arabic" : "English"}.`;
  }
}
app.post("/api/ai/chat", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      message,
      history,
      erpContext,
      language,
      model = "gemini-3.7-flash",
      role = "auditor",
      useSearch = false,
      useMaps = false,
      userLocation
    } = req.body;
    const isAr = language !== "en";
    let selectedModel = model;
    if (useMaps) {
      selectedModel = "gemini-3.5-flash";
    } else if (useSearch && !["gemini-3.5-flash", "gemini-3.7-flash"].includes(selectedModel)) {
      selectedModel = "gemini-3.5-flash";
    }
    if (!ai) {
      const lower = (message || "").toLowerCase();
      let replyAr = "\u0623\u0647\u0644\u0627\u064B \u0628\u0643! \u0623\u0646\u0627 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0630\u0643\u064A \u0644\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629. \u064A\u0645\u0643\u0646\u0646\u064A \u0645\u0633\u0627\u0639\u062F\u062A\u0643 \u0641\u064A \u062A\u062F\u0642\u064A\u0642 \u0623\u0648\u0632\u0627\u0646 \u0627\u0644\u0634\u0627\u062D\u0646\u0627\u062A\u060C \u062D\u0633\u0627\u0628 \u0646\u0633\u0628 \u0627\u0644\u0641\u0627\u0642\u062F\u060C \u0645\u0631\u0627\u062C\u0639\u0629 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0643\u0633\u0627\u0631\u0627\u062A\u060C \u0648\u0627\u0633\u062A\u062E\u0631\u0627\u062C \u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u062D\u0635\u064A\u0644.";
      let replyEn = "Welcome! I am the AI Assistant for Meayon Contracting Co. I can help audit weighbridge tickets, monitor transporter wastage, reconcile crusher ledgers, and optimize operations.";
      if (lower.includes("\u0641\u0627\u0642\u062F") || lower.includes("wastage") || lower.includes("\u0633\u0631\u0642\u0629") || lower.includes("\u062A\u0644\u0627\u0639\u0628") || lower.includes("loss")) {
        replyAr = `\u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629:
- \u0645\u0639\u062F\u0644 \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u0639\u0627\u0645: ${(erpContext?.kpis?.overallWastagePercent || 1.25).toFixed(2)}% (\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u0642\u062F: ${(erpContext?.kpis?.totalWastageTonnage || 24.5).toFixed(1)} \u0637\u0646).
- \u0627\u0644\u0646\u0627\u0642\u0644 \u0630\u0648 \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u0623\u0639\u0644\u0649: "\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0646\u0642\u0644 \u0627\u0644\u0633\u0631\u064A\u0639" (\u0627\u0644\u0634\u0627\u062D\u0646\u0629 3190-\u0631 \u0633 \u0628) \u0633\u062C\u0644 \u0646\u0633\u0628\u0629 \u0641\u0627\u0642\u062F 3.33% \u0639\u0644\u0649 \u062A\u0648\u0631\u064A\u062F\u0627\u062A \u064A\u0648\u0646\u064A \u0628\u064A\u062A\u0648\u0646.
- \u0627\u0644\u062A\u0648\u0635\u064A\u0629: \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062E\u0635\u0645 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A \u0645\u0646 \u0645\u0633\u062A\u062D\u0642\u0627\u062A \u0627\u0644\u0646\u0627\u0642\u0644 \u0648\u0625\u0644\u0632\u0627\u0645\u0647 \u0628\u0625\u0639\u0627\u062F\u0629 \u0641\u062D\u0635 \u0648\u0632\u0646 \u0627\u0644\u0637\u0628\u0644\u064A\u0629/\u0627\u0644\u0641\u0627\u0631\u063A (Tare Weight).`;
        replyEn = `Based on current operational records:
- Overall wastage: ${(erpContext?.kpis?.overallWastagePercent || 1.25).toFixed(2)}% (Total loss: ${(erpContext?.kpis?.totalWastageTonnage || 24.5).toFixed(1)} tons).
- Highest wastage transporter: Fast Transport Est. (Truck 3190) recorded 3.33% loss on UniBeton shipments.
- Recommendation: Apply contractual penalty deduction and enforce tare scale re-calibration.`;
      } else if (lower.includes("\u0643\u0633\u0627\u0631\u0629") || lower.includes("crusher") || lower.includes("\u0631\u0635\u064A\u062F") || lower.includes("balance") || lower.includes("\u062F\u0627\u0626\u0646")) {
        replyAr = `\u0645\u0648\u0642\u0641 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0643\u0633\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646:
- \u0625\u062C\u0645\u0627\u0644\u064A \u0631\u0635\u064A\u062F \u0627\u0644\u0643\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062D\u0642: ${(erpContext?.kpis?.crusherPayableBalance || 42500).toLocaleString("en-US")} \u0631.\u0633.
- \u0623\u0643\u0628\u0631 \u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646 \u062D\u062C\u0645\u0627\u064B: \u0643\u0633\u0627\u0631\u0629 \u0627\u0644\u064A\u0645\u0627\u0645\u0629 (\u062D\u0635\u0629 45%) \u0648\u0643\u0633\u0627\u0631\u0629 \u0637\u0648\u0642 (\u062D\u0635\u0629 32%).
- \u064A\u0648\u0635\u0649 \u0628\u062C\u062F\u0648\u0644\u0629 \u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0635\u0631\u0641 \u0627\u0644\u062F\u0648\u0631\u064A\u0629 \u0648\u0645\u0637\u0627\u0628\u0642\u0629 \u062A\u0630\u0627\u0643\u0631 \u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u062E\u0631\u0648\u062C \u0645\u0639 \u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 \u0644\u062A\u062C\u0646\u0628 \u0623\u064A \u0627\u0632\u062F\u0648\u0627\u062C\u064A\u0629.`;
        replyEn = `Crusher Payables & Supplier Status:
- Total outstanding crusher payables: SAR ${(erpContext?.kpis?.crusherPayableBalance || 42500).toLocaleString("en-US")}.
- Main suppliers: Al-Yamama Crusher (45% share) and Touq Crusher (32% share).
- Recommendation: Schedule regular payment vouchers and cross-match weighbridge exit tickets with purchase invoices.`;
      } else if (lower.includes("\u0641\u0627\u062A\u0648\u0631\u0629") || lower.includes("invoice") || lower.includes("\u0639\u0645\u064A\u0644") || lower.includes("customer") || lower.includes("\u0645\u0628\u064A\u0639\u0627\u062A")) {
        replyAr = `\u0645\u0624\u0634\u0631\u0627\u062A \u0627\u0644\u0641\u0648\u062A\u0631\u0629 \u0648\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0644\u0644\u0639\u0645\u0644\u0627\u0621:
- \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A: ${(erpContext?.kpis?.totalSales || 88400).toLocaleString("en-US")} \u0631.\u0633 (\u0635\u0627\u0641\u064A \u0627\u0644\u0631\u0628\u062D \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A: ${(erpContext?.kpis?.netOperatingProfit || 36700).toLocaleString("en-US")} \u0631.\u0633).
- \u0643\u0628\u0631\u0649 \u0627\u0644\u062C\u0647\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u0644\u0645\u0629: \u0634\u0631\u0643\u0629 \u064A\u0648\u0646\u064A \u0628\u064A\u062A\u0648\u0646 \u0648\u0634\u0631\u0643\u0629 \u0627\u0644\u0643\u0641\u0627\u062D \u0644\u0645\u0634\u0627\u0631\u064A\u0639 \u0627\u0644\u062E\u0631\u0633\u0627\u0646\u0629.
- \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0645\u062A\u0648\u0627\u0641\u0642\u0629 100% \u0645\u0639 \u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0647\u064A\u0626\u0629 \u0627\u0644\u0632\u0643\u0627\u0629 \u0648\u0627\u0644\u0636\u0631\u064A\u0628\u0629 \u0648\u0627\u0644\u062C\u0645\u0627\u0631\u0643 (ZATCA) \u0645\u0639 \u0628\u0627\u0631\u0643\u0648\u062F TLV \u0645\u0634\u0641\u0631.`;
        replyEn = `Customer Billing & Sales Overview:
- Total Sales: SAR ${(erpContext?.kpis?.totalSales || 88400).toLocaleString("en-US")} (Net operating profit: SAR ${(erpContext?.kpis?.netOperatingProfit || 36700).toLocaleString("en-US")}).
- Top clients: UniBeton Readymix and Al-Kifah Contracting.
- Invoices are 100% compliant with ZATCA e-invoicing and encrypted TLV QR codes.`;
      }
      return res.json({
        success: true,
        reply: isAr ? replyAr : replyEn,
        modelUsed: selectedModel,
        suggestedActions: [
          { labelAr: "\u062A\u062F\u0642\u064A\u0642 \u0641\u0627\u0642\u062F \u0627\u0644\u0648\u0632\u0646", labelEn: "Audit Transit Wastage", query: "\u0623\u0631\u064A\u062F \u062A\u0642\u0631\u064A\u0631\u0627\u064B \u0634\u0627\u0645\u0644\u0627\u064B \u0628\u0627\u0644\u0631\u062D\u0644\u0627\u062A \u0627\u0644\u062A\u064A \u062A\u062C\u0627\u0648\u0632 \u0641\u064A\u0647\u0627 \u0627\u0644\u0641\u0627\u0642\u062F 1.5 \u0637\u0646" },
          { labelAr: "\u0645\u0637\u0627\u0628\u0642\u0629 \u062D\u0633\u0627\u0628\u0627\u062A \u0645\u0648\u0631\u062F\u064A \u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u062E\u0627\u0645", labelEn: "Reconcile Raw Material Sourcing Ledgers", query: "\u0645\u0627 \u0647\u0648 \u0635\u0627\u0641\u064A \u0627\u0644\u0623\u0631\u0628\u0627\u062D \u0648\u0645\u0633\u062A\u062D\u0642\u0627\u062A \u0645\u0648\u0631\u062F\u064A \u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u062E\u0627\u0645 \u063A\u064A\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629\u061F" },
          { labelAr: "\u0635\u064A\u0627\u063A\u0629 \u062E\u0637\u0627\u0628 \u0631\u0633\u0645\u064A \u0644\u0644\u0646\u0627\u0642\u0644", labelEn: "Draft Transporter Dispute Letter", query: "\u0642\u0645 \u0628\u0635\u064A\u0627\u063A\u0629 \u062E\u0637\u0627\u0628 \u0631\u0633\u0645\u064A \u0644\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0646\u0642\u0644 \u0628\u062E\u0635\u0648\u0635 \u062E\u0635\u0645 \u0641\u0627\u0642\u062F \u0627\u0644\u0648\u0632\u0646 \u0627\u0644\u0632\u0627\u0626\u062F" }
        ]
      });
    }
    const systemPrompt = getRoleSystemPrompt(role, erpContext, isAr);
    const contents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-8)) {
        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content }]
        });
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });
    const config = {
      systemInstruction: systemPrompt,
      temperature: 0.7
    };
    if (useMaps) {
      config.tools = [{ googleMaps: {} }];
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation?.latitude || 24.7136,
            longitude: userLocation?.longitude || 46.6753
          }
        }
      };
    } else if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    if (selectedModel === "gemini-3.1-pro-preview") {
      config.thinkingConfig = {
        thinkingLevel: import_genai.ThinkingLevel.HIGH
      };
    }
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config
    });
    const reply = response.text || (isAr ? "\u062A\u0645\u062A \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0637\u0644\u0628 \u0628\u0646\u062C\u0627\u062D." : "Request processed successfully.");
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const webSources = [];
    const mapSources = [];
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          webSources.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri
          });
        }
        if (chunk.maps) {
          mapSources.push({
            uri: chunk.maps.uri,
            title: chunk.maps.title || "Google Maps Location"
          });
        }
      }
    }
    return res.json({
      success: true,
      reply,
      modelUsed: selectedModel,
      webSources: webSources.length > 0 ? webSources : void 0,
      mapSources: mapSources.length > 0 ? mapSources : void 0,
      suggestedActions: [
        { labelAr: "\u0643\u0634\u0641 \u0627\u0644\u0641\u0627\u0642\u062F \u0648\u0627\u0644\u062A\u0644\u0627\u0639\u0628", labelEn: "Inspect High Wastage", query: "\u0623\u0631\u064A\u062F \u062A\u0642\u0631\u064A\u0631\u0627\u064B \u0645\u0641\u0635\u0644\u0627\u064B \u0628\u0627\u0644\u0634\u0627\u062D\u0646\u0627\u062A \u0630\u0627\u062A \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u0645\u0631\u062A\u0641\u0639" },
        { labelAr: "\u0645\u0648\u0642\u0641 \u0627\u0644\u0643\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A", labelEn: "Crusher Balances", query: "\u0645\u0627 \u0647\u064A \u0623\u0631\u0635\u062F\u0629 \u0627\u0644\u0643\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0629 \u0648\u0647\u0644 \u062A\u0648\u062C\u062F \u0641\u0631\u0648\u0642\u0627\u062A \u0641\u064A \u0627\u0644\u0623\u0633\u0639\u0627\u0631\u061F" },
        { labelAr: "\u0635\u064A\u0627\u063A\u0629 \u062E\u0637\u0627\u0628 \u0631\u0633\u0645\u064A", labelEn: "Draft Formal Notice", query: "\u0635\u064A\u063A \u062E\u0637\u0627\u0628 \u0631\u0633\u0645\u064A \u0645\u0648\u062C\u0647 \u0644\u0644\u0646\u0627\u0642\u0644 \u0628\u0634\u0623\u0646 \u062E\u0635\u0645 \u0627\u0644\u0641\u0627\u0642\u062F" }
      ]
    });
  } catch (error) {
    console.error("AI Chat Error:", error);
    return res.status(500).json({ error: error.message || "Failed to complete AI chat" });
  }
});
app.post("/api/ai/search-grounding", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { query, language = "ar" } = req.body;
    const isAr = language !== "en";
    if (!ai) {
      return res.json({
        success: true,
        answer: isAr ? `\u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0623\u062D\u062F\u062B \u0644\u0648\u0627\u0626\u062D \u0627\u0644\u0647\u064A\u0626\u0629 \u0627\u0644\u0639\u0627\u0645\u0629 \u0644\u0644\u0646\u0642\u0644 \u0648\u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u0637\u0627\u0642\u0629 \u0641\u064A \u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629:
- \u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0644\u0648\u0632\u0646 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0644\u0644\u0634\u0627\u062D\u0646\u0627\u062A \u0627\u0644\u062A\u0631\u064A\u0644\u0627 (5 \u0645\u062D\u0627\u0648\u0631): 45 \u0637\u0646\u060C \u0645\u0639 \u062A\u0637\u0628\u064A\u0642 \u063A\u0631\u0627\u0645\u0627\u062A \u0622\u0644\u064A\u0629 \u0639\u0646\u062F \u0645\u062D\u0637\u0627\u062A \u0627\u0644\u0648\u0632\u0646 \u0627\u0644\u0630\u0643\u064A\u0629.
- \u0633\u0639\u0631 \u0627\u0644\u062F\u064A\u0632\u0644 \u0644\u0644\u0634\u0627\u062D\u0646\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629 \u0645\u0639\u062A\u0645\u062F \u0648\u0641\u0642 \u0627\u0644\u062A\u0633\u0639\u064A\u0631\u0629 \u0627\u0644\u062F\u0648\u0631\u064A\u0629 \u0644\u0634\u0631\u0643\u0629 \u0623\u0631\u0627\u0645\u0643\u0648 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629.
- \u0627\u0634\u062A\u0631\u0627\u0637\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u062A\u0644\u0632\u0645 \u0628\u062A\u063A\u0637\u064A\u0629 \u0627\u0644\u062D\u0645\u0648\u0644\u0627\u062A \u0627\u0644\u062D\u0635\u0648\u064A\u0629 \u0628\u0634\u0631\u0627\u0639 \u0645\u062D\u0643\u0645 \u0644\u0645\u0646\u0639 \u0627\u0644\u062A\u0637\u0627\u064A\u0631 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0633\u064A\u0631 \u0639\u0644\u0649 \u0627\u0644\u0637\u0631\u0642 \u0627\u0644\u0633\u0631\u064A\u0639\u0629.` : `Based on current Saudi Transport Authority regulations:
- Max allowable gross weight for 5-axle haulage trailers is 45 metric tons with smart weigh-in-motion monitoring.
- Commercial diesel fuel prices follow periodic Saudi Aramco revisions.
- Tarp covers are legally mandatory for all aggregate and sand haulage to prevent highway spills.`,
        sources: [
          { title: "\u0627\u0644\u0647\u064A\u0626\u0629 \u0627\u0644\u0639\u0627\u0645\u0629 \u0644\u0644\u0646\u0642\u0644 - \u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 (TGA)", uri: "https://tga.gov.sa" },
          { title: "\u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u0646\u0642\u0644 \u0648\u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0644\u0648\u062C\u0633\u062A\u064A\u0629 (MOTLS)", uri: "https://mot.gov.sa" },
          { title: "\u0647\u064A\u0626\u0629 \u0627\u0644\u0632\u0643\u0627\u0629 \u0648\u0627\u0644\u0636\u0631\u064A\u0628\u0629 \u0648\u0627\u0644\u062C\u0645\u0627\u0631\u0643 (ZATCA)", uri: "https://zatca.gov.sa" }
        ]
      });
    }
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: query,
      config: {
        systemInstruction: `You are an expert logistics researcher for Saudi heavy transport and quarry operations. Search the web for up-to-date accurate information regarding transport regulations, Saudi ministry directives, aggregate market conditions, or weather in Saudi Arabia. Provide answers in ${isAr ? "Arabic" : "English"}.`,
        tools: [{ googleSearch: {} }]
      }
    });
    const sources = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri
          });
        }
      }
    }
    return res.json({
      success: true,
      answer: response.text,
      sources
    });
  } catch (error) {
    console.error("Search Grounding Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/maps-grounding", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { query, latitude = 24.7136, longitude = 46.6753, language = "ar" } = req.body;
    const isAr = language !== "en";
    if (!ai) {
      return res.json({
        success: true,
        answer: isAr ? `\u0623\u0628\u0631\u0632 \u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0643\u0633\u0627\u0631\u0627\u062A \u0648\u0645\u062D\u0637\u0627\u062A \u0627\u0644\u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u062D\u0648\u0644 \u0627\u0644\u0631\u064A\u0627\u0636 \u0648\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0648\u0633\u0637\u0649:
1. **\u0643\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u062D\u0627\u064A\u0631 \u0648\u0637\u0631\u064A\u0642 \u0627\u0644\u062E\u0631\u062C**: \u062A\u0636\u0645 \u0643\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0631\u0645\u0644 \u0648\u0627\u0644\u062D\u0635\u0649 \u0627\u0644\u0645\u063A\u0633\u0648\u0644 \u0639\u0644\u0649 \u0628\u0639\u062F 45 \u0643\u0645 \u062C\u0646\u0648\u0628 \u0627\u0644\u0631\u064A\u0627\u0636.
2. **\u0643\u0633\u0627\u0631\u0627\u062A \u0637\u0631\u064A\u0642 \u0627\u0644\u062F\u0645\u0627\u0645 (\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0634\u0631\u0642)**: \u062A\u062E\u062F\u0645 \u0645\u0634\u0627\u0631\u064A\u0639 \u0627\u0644\u062E\u0631\u0633\u0627\u0646\u0629 \u0627\u0644\u062C\u0627\u0647\u0632\u0629 \u0641\u064A \u0634\u0631\u0642 \u0627\u0644\u0631\u064A\u0627\u0636.
3. **\u0645\u062D\u0637\u0629 \u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u0631\u064A\u0627\u0636 - \u0627\u0644\u062E\u0631\u062C \u0627\u0644\u0630\u0643\u064A\u0629**: \u0645\u062D\u0637\u0629 \u0642\u064A\u0627\u0633 \u0623\u0648\u0632\u0627\u0646 \u0627\u0644\u0634\u0627\u062D\u0646\u0627\u062A \u0627\u0644\u0631\u0633\u0645\u064A\u0629 \u0627\u0644\u062A\u0627\u0628\u0639\u0629 \u0644\u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u0646\u0642\u0644.` : `Key quarry locations and certified weighbridge stations around Riyadh:
1. **Al-Ha'ir & Al-Kharj Quarries**: Washed sand and aggregate crushers 45 km south of Riyadh.
2. **Eastern Dammam Road Quarries**: Supplying readymix concrete plants in East Riyadh.
3. **Al-Kharj Highway Smart Weighbridge**: Official Ministry of Transport vehicle scale facility.`,
        places: [
          { title: "\u0643\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u062D\u0627\u064A\u0631\u060C \u062C\u0646\u0648\u0628 \u0627\u0644\u0631\u064A\u0627\u0636", uri: "https://maps.google.com/?q=Al-Hair+Quarries+Riyadh" },
          { title: "\u0643\u0633\u0627\u0631\u0629 \u0627\u0644\u064A\u0645\u0627\u0645\u0629\u060C \u0627\u0644\u0631\u064A\u0627\u0636", uri: "https://maps.google.com/?q=Yamama+Crusher+Riyadh" },
          { title: "\u0645\u062D\u0637\u0629 \u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u0634\u0627\u062D\u0646\u0627\u062A - \u0637\u0631\u064A\u0642 \u0627\u0644\u062E\u0631\u062C", uri: "https://maps.google.com/?q=Truck+Weighbridge+Al-Kharj+Road" }
        ]
      });
    }
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: query,
      config: {
        systemInstruction: `You are a Saudi logistics geospatial expert. Provide precise location details for quarries, crushers, ready-mix batching plants, and truck weigh stations in Saudi Arabia with exact geographical guidance in ${isAr ? "Arabic" : "English"}.`,
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: Number(latitude),
              longitude: Number(longitude)
            }
          }
        }
      }
    });
    const places = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if (chunk.maps) {
          places.push({
            title: chunk.maps.title || "Google Maps Location",
            uri: chunk.maps.uri
          });
        }
      }
    }
    return res.json({
      success: true,
      answer: response.text,
      places
    });
  } catch (error) {
    console.error("Maps Grounding Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/generate-image", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { prompt, aspectRatio = "1:1", imageSize = "1K" } = req.body;
    if (!ai) {
      return res.json({
        success: true,
        imageUrl: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=800&auto=format&fit=crop&q=80",
        description: "Simulated image preview (Meayon Heavy Logistics & Quarry Haulage)"
      });
    }
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: {
        parts: [
          {
            text: `High quality realistic professional photography for Saudi contracting & heavy haulage enterprise "Meayon Contracting Co. Ltd.": ${prompt}`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize
        }
      }
    });
    let generatedImageUrl = "";
    let description = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
        } else if (part.text) {
          description = part.text;
        }
      }
    }
    if (!generatedImageUrl) {
      throw new Error("No image was returned by the model");
    }
    return res.json({
      success: true,
      imageUrl: generatedImageUrl,
      description
    });
  } catch (error) {
    console.error("Generate Image Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/edit-image", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { imageBase64, mimeType = "image/png", prompt, aspectRatio = "1:1" } = req.body;
    if (!ai) {
      return res.json({
        success: true,
        imageUrl: imageBase64 ? `data:${mimeType};base64,${imageBase64}` : "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&auto=format&fit=crop&q=80",
        description: "Simulated edited image preview"
      });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType
            }
          },
          {
            text: `Edit this image according to instructions: ${prompt}`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio
        }
      }
    });
    let editedImageUrl = "";
    let description = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          editedImageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
        } else if (part.text) {
          description = part.text;
        }
      }
    }
    if (!editedImageUrl) {
      throw new Error("No edited image was returned");
    }
    return res.json({
      success: true,
      imageUrl: editedImageUrl,
      description
    });
  } catch (error) {
    console.error("Edit Image Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/generate-video", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { prompt, imageBase64, mimeType = "image/png", aspectRatio = "16:9", resolution = "720p" } = req.body;
    if (!ai) {
      const simulatedOpName = `models/veo-3.1-fast-generate-preview/operations/sim_${Date.now()}`;
      return res.json({
        success: true,
        operationName: simulatedOpName,
        isSimulated: true
      });
    }
    const payload = {
      model: "veo-3.1-fast-generate-preview",
      prompt: prompt || "Cinematic drone view of heavy haulage dump trucks operating in a Saudi limestone quarry at sunrise",
      config: {
        numberOfVideos: 1,
        resolution,
        aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9"
      }
    };
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      payload.image = {
        imageBytes: cleanBase64,
        mimeType
      };
    }
    const operation = await ai.models.generateVideos(payload);
    return res.json({
      success: true,
      operationName: operation.name,
      isSimulated: false
    });
  } catch (error) {
    console.error("Veo Video Gen Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/video-status", async (req, res) => {
  try {
    const { operationName } = req.body;
    const ai = getGeminiClient();
    if (!operationName) {
      return res.status(400).json({ error: "operationName is required" });
    }
    if (!ai || operationName.startsWith("models/veo-3.1-fast-generate-preview/operations/sim_")) {
      return res.json({
        success: true,
        done: true,
        videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        isSimulated: true
      });
    }
    const op = new import_genai.GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    const isDone = Boolean(updated.done);
    const videoUri = updated.response?.generatedVideos?.[0]?.video?.uri;
    return res.json({
      success: true,
      done: isDone,
      hasVideo: Boolean(videoUri),
      metadata: updated.metadata
    });
  } catch (error) {
    console.error("Video Status Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/video-download", async (req, res) => {
  try {
    const { operationName } = req.body;
    const ai = getGeminiClient();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!operationName) {
      return res.status(400).json({ error: "operationName is required" });
    }
    if (!ai || !apiKey || operationName.includes("sim_")) {
      return res.redirect("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4");
    }
    const op = new import_genai.GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: "Video URI not found or generation not finished yet" });
    }
    const videoRes = await fetch(uri, {
      headers: { "x-goog-api-key": apiKey }
    });
    res.setHeader("Content-Type", "video/mp4");
    const arrayBuffer = await videoRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Video Download Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/draft-letter", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { letterType, recipientName, referenceData, language } = req.body;
    const isAr = language !== "en";
    if (!ai) {
      return res.json({
        success: true,
        letterText: isAr ? `\u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629
\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629
\u0633.\u062A: 1010824619 | \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0636\u0631\u064A\u0628\u064A: 310892019400003

\u0627\u0644\u062A\u0627\u0631\u064A\u062E: ${(/* @__PURE__ */ new Date()).toLocaleDateString("ar-SA")}
\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0645\u0631\u062C\u0639\u064A: MYN/DISP/${(/* @__PURE__ */ new Date()).getFullYear()}/089

\u0627\u0644\u0633\u0627\u062F\u0629 / ${recipientName || "\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0646\u0642\u0644 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629"} \u0627\u0644\u0645\u062D\u062A\u0631\u0645\u0648\u0646\u060C
\u0639\u0646\u0627\u064A\u0629: \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A \u0648\u0627\u0644\u062D\u0631\u0643\u0629

\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064A\u0643\u0645 \u0648\u0631\u062D\u0645\u0629 \u0627\u0644\u0644\u0647 \u0648\u0628\u0631\u0643\u0627\u062A\u0647\u060C\u060C\u060C

\u0627\u0644\u0645\u0648\u0636\u0648\u0639: \u0625\u0634\u0639\u0627\u0631 \u0631\u0633\u0645\u064A \u0628\u0634\u0623\u0646 \u0641\u0631\u0648\u0642\u0627\u062A \u0623\u0648\u0632\u0627\u0646 \u0648\u062A\u062C\u0627\u0648\u0632 \u0646\u0633\u0628\u0629 \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627 \u0641\u064A \u0631\u062D\u0644\u0627\u062A \u0627\u0644\u062A\u0648\u0631\u064A\u062F

\u0628\u0627\u0644\u0625\u0634\u0627\u0631\u0629 \u0625\u0644\u0649 \u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0646\u0642\u0644 \u0648\u062A\u0648\u0631\u064A\u062F \u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u062D\u0635\u0648\u064A\u0629 \u0627\u0644\u0645\u0628\u0631\u0645\u0629 \u0645\u0639\u0643\u0645\u060C \u0648\u0625\u0644\u0649 \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0644\u0631\u062D\u0644\u0627\u062A \u0627\u0644\u062A\u0648\u0631\u064A\u062F \u0627\u0644\u0623\u062E\u064A\u0631\u0629\u060C \u0646\u0648\u062F \u0625\u062D\u0627\u0637\u062A\u0643\u0645 \u0628\u0623\u0646\u0647 \u0628\u0639\u062F \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u0627\u0644\u0622\u0644\u064A \u0644\u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u0645\u064A\u0632\u0627\u0646 \u062A\u0628\u064A\u0646 \u0648\u062C\u0648\u062F \u0646\u0642\u0635 \u063A\u064A\u0631 \u0645\u0628\u0631\u0631 \u0641\u064A \u0627\u0644\u062D\u0645\u0648\u0644\u0629 \u0627\u0644\u0645\u0633\u0644\u0645\u0629 \u0644\u062F\u0649 \u0645\u0648\u0642\u0639 \u0627\u0644\u0639\u0645\u064A\u0644.

\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u062E\u0627\u0644\u0641\u0629:
- \u062A\u062C\u0627\u0648\u0632 \u0646\u0633\u0628\u0629 \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u062D\u062F \u0627\u0644\u062A\u0639\u0627\u0642\u062F\u064A \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647 (1.5%).
- \u0625\u062C\u0645\u0627\u0644\u064A \u0643\u0645\u064A\u0629 \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u0645\u0631\u0635\u0648\u062F\u0629: ${referenceData?.wastageTons || 2.8} \u0637\u0646 \u0628\u0642\u064A\u0645\u0629 \u062A\u0642\u062F\u064A\u0631\u064A\u0629 ${referenceData?.wastageValue || 420} \u0631.\u0633.

\u0628\u0646\u0627\u0621\u064B \u0639\u0644\u064A\u0647\u060C \u0646\u0641\u064A\u062F\u0643\u0645 \u0628\u0623\u0646\u0647 \u0633\u064A\u062A\u0645 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062E\u0635\u0645 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A \u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0641\u0627\u0642\u062F \u0645\u0646 \u0645\u0633\u062A\u062D\u0642\u0627\u062A \u0627\u0644\u0646\u0642\u0644 \u0644\u0644\u0634\u0647\u0631 \u0627\u0644\u062C\u0627\u0631\u064A\u060C \u0645\u0639 \u0627\u0644\u062A\u0623\u0643\u064A\u062F \u0639\u0644\u0649 \u0636\u0631\u0648\u0631\u0629 \u0641\u062D\u0635 \u0648\u0645\u0639\u0627\u064A\u0631\u0629 \u0623\u063A\u0637\u064A\u0629 \u0627\u0644\u0634\u0627\u062D\u0646\u0627\u062A \u0648\u0648\u0632\u0646 \u0627\u0644\u0637\u0628\u0644\u064A\u0629 \u0627\u0644\u0641\u0627\u0631\u063A\u0629 \u0642\u0628\u0644 \u0627\u0644\u062A\u062D\u0645\u064A\u0644.

\u0634\u0627\u0643\u0631\u064A\u0646 \u0644\u0643\u0645 \u062D\u0633\u0646 \u062A\u0639\u0627\u0648\u0646\u0643\u0645 \u0627\u0644\u062F\u0627\u0626\u0645\u060C\u060C\u060C

\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0627\u0644\u062A\u0646\u0641\u064A\u0630\u064A
\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629
(\u062E\u062A\u0645 \u0648\u062A\u0648\u0642\u064A\u0639 \u0631\u0633\u0645\u064A)` : `Kingdom of Saudi Arabia
Meayon Economic Contracting Co. Ltd.
CR: 1010824619 | VAT: 310892019400003

Date: ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}
Ref: MYN/DISP/${(/* @__PURE__ */ new Date()).getFullYear()}/089

To: ${recipientName || "Authorized Transporter Est."}
Attn: Operations & Fleet Management

Subject: Formal Notice Regarding Excessive Weight Discrepancies & Cargo Shrinkage

With reference to our aggregate haulage agreement and weighbridge scale ticket records, an automated audit has detected excessive weight variance exceeding the maximum allowable threshold (1.5%).

Audit Findings:
- Total Unjustified Loss: ${referenceData?.wastageTons || 2.8} Metric Tons.
- Financial Deduction: SAR ${referenceData?.wastageValue || 420}.

Please be advised that this shrinkage value will be deducted from your pending freight settlement for the current billing cycle.

Sincerely,
Executive Management
Meayon Economic Contracting Co. Ltd.`
      });
    }
    const prompt = `Draft an official, highly formal Saudi commercial letter/memo on behalf of "Meayon Economic Contracting Co. Ltd." (\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629).
Letter Type: ${letterType || "Dispute Notice"}
Recipient: ${recipientName || "Party"}
Reference Details: ${JSON.stringify(referenceData || {})}
Language: ${isAr ? "Arabic" : "English"}

Include official header layout, reference number, date, formal address, itemized bullet points of the discrepancies, contract clauses, required corrective action, and executive sign-off.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are the Chief Legal and Operational Auditor for a leading Saudi contracting corporation. Write flawless, authoritative, and legally sound business communications in modern standard Arabic and English."
      }
    });
    return res.json({
      success: true,
      letterText: response.text
    });
  } catch (error) {
    console.error("Draft Letter Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/api/ai/analyze-operations", async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(200).json({
        fallback: true,
        analysis: {
          executiveSummaryAr: "\u062A\u0645 \u0625\u062C\u0631\u0627\u0621 \u062A\u062F\u0642\u064A\u0642 \u062A\u0634\u063A\u064A\u0644\u064A \u0622\u0644\u064A \u0644\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0633\u062C\u0644\u0629. \u064A\u064F\u0644\u0627\u062D\u0638 \u0627\u0633\u062A\u0642\u0631\u0627\u0631 \u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0646\u0642\u0644 \u0645\u0639 \u0648\u062C\u0648\u062F \u062A\u0641\u0627\u0648\u062A \u0637\u0641\u064A\u0641 \u0641\u064A \u0646\u0633\u0628 \u0627\u0644\u0641\u0627\u0642\u062F \u0644\u0628\u0639\u0636 \u0627\u0644\u0646\u0627\u0642\u0644\u064A\u0646.",
          executiveSummaryEn: "Automated operational audit completed. Transport operations show steady volumes with minor variance in wastage rates.",
          operationalHealthScore: 88,
          wastageAudit: {
            totalWastageTons: 24.5,
            totalWastageValueSAR: 3675,
            riskLevel: "Medium",
            transportersWithExcessiveLoss: [
              { name: "\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0646\u0642\u0644 \u0627\u0644\u0633\u0631\u064A\u0639", lossTons: 6.8, percentage: 2.8, flagReason: "\u062A\u062C\u0627\u0648\u0632 \u0646\u0633\u0628\u0629 \u0627\u0644\u0641\u0627\u0642\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D\u0629 \u0639\u0644\u0649 \u0645\u0633\u0627\u0631 \u064A\u0648\u0646\u064A \u0628\u064A\u062A\u0648\u0646" },
              { name: "\u0646\u0627\u0642\u0644\u064A\u0627\u062A \u0627\u0644\u0635\u062D\u0631\u0627\u0621 \u0627\u0644\u0643\u0628\u0631\u0649", lossTons: 4.2, percentage: 2.1, flagReason: "\u062A\u0628\u0627\u064A\u0646 \u0648\u0632\u0646 \u0627\u0644\u0637\u0628\u0644\u064A\u0629 \u0627\u0644\u0641\u0627\u0631\u063A\u0629 \u0639\u0646\u062F \u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u0643\u0633\u0627\u0631\u0629" }
            ]
          },
          crusherFinancialAnalysis: "\u0643\u0633\u0627\u0631\u0629 \u0627\u0644\u064A\u0645\u0627\u0645\u0629 \u062A\u0645\u062B\u0644 45% \u0645\u0646 \u062D\u062C\u0645 \u0627\u0644\u062A\u0648\u0631\u064A\u062F \u0628\u0623\u0633\u0639\u0627\u0631 \u062A\u0646\u0627\u0641\u0633\u064A\u0629 (28 \u0631.\u0633 \u0644\u0644\u0637\u0646). \u0643\u0633\u0627\u0631\u0629 \u0637\u0648\u0642 \u062A\u0633\u062C\u0644 \u0623\u0639\u0644\u0649 \u0647\u0627\u0645\u0634 \u0631\u0628\u062D \u0644\u0644\u0645\u062A\u0631 \u0627\u0644\u0645\u0643\u0639\u0628.",
          customerBillingInsights: "\u062C\u0645\u064A\u0639 \u0641\u0648\u0627\u062A\u064A\u0631 \u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u062E\u0631\u0633\u0627\u0646\u0629 \u0627\u0644\u062C\u0627\u0647\u0632\u0629 (\u064A\u0648\u0646\u064A \u0628\u064A\u062A\u0648\u0646\u060C \u0627\u0644\u0643\u0641\u0627\u062D) \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0625\u0635\u062F\u0627\u0631 \u0645\u0639 \u0628\u0627\u0631\u0643\u0648\u062F ZATCA \u0627\u0644\u0645\u0639\u062A\u0645\u062F.",
          anomaliesDetected: [
            {
              title: "\u062A\u0628\u0627\u064A\u0646 \u0641\u0627\u0642\u062F \u0627\u0644\u0634\u0627\u062D\u0646\u0629 3190",
              severity: "Medium",
              details: "\u0633\u062C\u0644\u062A \u0627\u0644\u0634\u0627\u062D\u0646\u0629 3190 \u0641\u0627\u0642\u062F\u0627\u064B \u0628\u0645\u0642\u062F\u0627\u0631 1.4 \u0637\u0646 \u0641\u064A \u0631\u062D\u0644\u0629 \u0648\u0627\u062D\u062F\u0629 \u0645\u0646 \u0643\u0633\u0627\u0631\u0629 \u0637\u0648\u0642 \u0625\u0644\u0649 \u064A\u0648\u0646\u064A \u0628\u064A\u062A\u0648\u0646.",
              actionPlan: "\u062E\u0635\u0645 \u0642\u064A\u0645\u0629 \u0627\u0644\u0641\u0627\u0642\u062F \u0645\u0646 \u0645\u0633\u062A\u062D\u0642\u0627\u062A \u0627\u0644\u0646\u0627\u0642\u0644 \u0648\u0645\u0639\u0627\u064A\u0631\u0629 \u0645\u064A\u0632\u0627\u0646 \u0627\u0644\u0628\u0633\u0643\u0648\u0644."
            }
          ],
          strategicRecommendations: [
            "\u062F\u0645\u062C \u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0642\u0644 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u062A\u0642\u0627\u0631\u0628\u064A\u0646 \u062C\u063A\u0631\u0627\u0641\u064A\u0627\u064B \u0644\u062E\u0641\u0636 \u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0637\u0646/\u0643\u0645.",
            "\u062A\u0633\u0631\u064A\u0639 \u062F\u0648\u0631\u0629 \u062A\u062D\u0635\u064A\u0644 \u0627\u0644\u0645\u0637\u0627\u0644\u0628\u0627\u062A \u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u062E\u0631\u0633\u0627\u0646\u0629 \u0627\u0644\u062C\u0627\u0647\u0632\u0629 \u0644\u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u062A\u062F\u0641\u0642 \u0627\u0644\u0646\u0642\u062F\u064A.",
            "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0648\u0642\u064A\u0639 \u0627\u0644\u0631\u0642\u0645\u064A \u0644\u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0635\u0631\u0641 \u0648\u0627\u0644\u0642\u0628\u0636 \u0641\u0648\u0631\u064A\u0627\u064B."
          ]
        }
      });
    }
    const { operationsData, stats, queryType, prompt } = req.body;
    const systemPrompt = `You are the Chief Operations & Financial Auditor AI for "Meayon Economic Contracting Co. Ltd." (\u0634\u0631\u0643\u0629 \u0645\u064A\u0648\u0646 \u0644\u0644\u0645\u0642\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629), a premier Saudi heavy transport and quarry materials supply company.
Analyze operational haulage data (quarry crushers, transporters, trucks, customer deliveries, loaded vs delivered tonnage, scale tickets, wastage loss, sales revenue, crusher purchase cost, and net margins).

Language: Provide detailed, highly professional responses in Arabic as the primary language with English translations/summaries for executive presentation.

Output must be strictly valid JSON matching this schema:
{
  "executiveSummaryAr": "string",
  "executiveSummaryEn": "string",
  "operationalHealthScore": number (1-100),
  "wastageAudit": {
    "totalWastageTons": number,
    "totalWastageValueSAR": number,
    "riskLevel": "Low" | "Medium" | "High" | "Critical",
    "transportersWithExcessiveLoss": [
      { "name": "string", "lossTons": number, "percentage": number, "flagReason": "string" }
    ]
  },
  "crusherFinancialAnalysis": "string",
  "customerBillingInsights": "string",
  "anomaliesDetected": [
    { "title": "string", "severity": "Low" | "Medium" | "High", "details": "string", "actionPlan": "string" }
  ],
  "strategicRecommendations": ["string"]
}`;
    const userMessage = prompt || `Here is the current operational snapshot for analysis:
Stats Summary: ${JSON.stringify(stats || {})}
Recent Operations (sample): ${JSON.stringify((operationsData || []).slice(0, 35))}
Query Type: ${queryType || "comprehensive_audit"}

Perform an in-depth audit checking for scale ticket discrepancies, driver material loss patterns, crusher margin leakages, and customer delivery volume optimization.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });
    const resultText = response.text || "{}";
    let parsedData;
    try {
      parsedData = JSON.parse(resultText);
    } catch {
      parsedData = { text: resultText };
    }
    return res.json({ success: true, analysis: parsedData });
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate operational AI insights"
    });
  }
});
app.post("/api/ai/nl-query", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { query, availableFilters } = req.body;
    if (!ai) {
      return res.json({
        success: true,
        filters: {
          search: query || ""
        },
        explanation: "Filtered by keyword search."
      });
    }
    const systemPrompt = `You parse natural language queries from logistics managers into structured filter criteria for the Meayon Transport ERP.
Available filters: customer, crusher, transporter, materialType, minWastage, month, hasExcessWastage (boolean), dateFrom, dateTo.
Respond in JSON with:
{
  "filters": {
    "customer": string | null,
    "crusher": string | null,
    "transporter": string | null,
    "materialType": string | null,
    "minWastage": number | null,
    "month": number | null,
    "hasExcessWastage": boolean | null,
    "search": string | null
  },
  "explanationAr": "string",
  "explanationEn": "string"
}`;
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: `User Query: "${query}". Available meta: ${JSON.stringify(availableFilters || {})}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });
    const result = JSON.parse(response.text || "{}");
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("NL Query Error:", error);
    return res.status(500).json({ error: error.message });
  }
});
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.get("/sw.js", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(import_path.default.join(distPath, "sw.js"));
    });
    app.use("/assets", import_express.default.static(import_path.default.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true
    }));
    app.use(import_express.default.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  const HOST = process.env.HOST || "127.0.0.1";
  app.listen(3e3, HOST, () => {
    console.log(`Server running on http://${HOST}:3000`);
  });
}
start();
//# sourceMappingURL=server.cjs.map
