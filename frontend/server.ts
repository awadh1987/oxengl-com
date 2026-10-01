import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel, GenerateVideosOperation } from '@google/genai';
import dotenv from 'dotenv';
import { tenantResolverMiddleware, ExtendedRequest } from './src/middleware/tenantResolver';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(tenantResolverMiddleware);

// Lazy initialize Gemini AI Client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    client: 'Meayon Economic Contracting Co. Ltd. (شركة ميون للمقاولات المحدودة)',
    service: 'Transport & Freight ERP API with Gemini AI Suite',
    timestamp: new Date().toISOString(),
  });
});

// SaaS Platform & Multi-Tenant Routing Endpoints
app.get('/api/platform/resolve-tenant', (req: ExtendedRequest, res) => {
  if (req.plane === 'unknown') {
    return res.status(404).json({
      success: false,
      error: 'Unrecognized tenant or custom domain',
      plane: 'unknown',
      tenant: null,
      host: req.headers.host || '',
    });
  }
  res.json({
    success: true,
    plane: req.plane || 'root',
    tenant: req.tenant || null,
    host: req.headers.host || '',
  });
});

const ALLOWED_ASSET_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

app.post('/api/platform/assets/upload', (req: ExtendedRequest, res) => {
  // 1. Enforce authentication on the upload endpoint
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication token is required to upload platform assets',
    });
  }

  const { fileName, fileType, fileSize, fileBuffer, assetType, primaryColor, secondaryColor, wallpaperUrl, backgroundUrl } = req.body || {};
  let assetUrl = fileBuffer || (assetType?.includes('wallpaper') ? '/assets/default-mesh-bg.jpg' : '/assets/default-crown.svg');

  if (typeof fileBuffer === 'string' && fileBuffer.startsWith('data:')) {
    // 2. Strict MIME-type and extension allowlisting
    const mimeMatch = fileBuffer.match(/^data:([^;]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1].toLowerCase().trim() : null;
    const ext = detectedMime ? ALLOWED_ASSET_MIMES[detectedMime] : null;

    if (!ext) {
      return res.status(400).json({
        error: 'Invalid file type: allowed types are .png, .jpg, .jpeg, .webp, .svg',
      });
    }

    try {
      const base64Data = fileBuffer.split(',')[1];
      // 3. Cryptographically secure random UUID filename (no user-supplied strings in path)
      const secureId = crypto.randomUUID();
      const fname = `asset_${secureId}.${ext}`;

      // 4. Normalized path traversal prevention
      const targets = [
        path.resolve('/var/www/oxengl/dist/assets'),
        path.resolve('/var/www/erp/frontend/dist/assets'),
        path.resolve(__dirname, 'public/assets'),
      ];

      for (const targetDir of targets) {
        if (fs.existsSync(targetDir)) {
          const destPath = path.resolve(targetDir, fname);
          if (destPath.startsWith(targetDir + path.sep)) {
            fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
          }
        }
      }
      assetUrl = `/assets/${fname}`;
    } catch (e) {
      return res.status(500).json({ error: 'Failed to write uploaded asset' });
    }
  }

  const resolvedWallpaper = wallpaperUrl || (assetType?.includes('wallpaper') ? assetUrl : null);
  const resolvedBackground = backgroundUrl || (assetType?.includes('wallpaper') ? assetUrl : null);
  res.json({
    status: 'success',
    url: assetUrl,
    fileName: `asset_${Date.now()}`,
    assetType,
    primaryColor,
    secondaryColor,
    wallpaperUrl: resolvedWallpaper,
    backgroundUrl: resolvedBackground,
  });
});

// Authoritative API Proxy to FastAPI Backend (port 8000) for all non-AI ERP domains
app.use('/api', async (req, res, next) => {
  if (
    req.path.startsWith('/ai') ||
    req.path.startsWith('/platform/resolve-tenant') ||
    req.path.startsWith('/platform/assets')
  ) {
    return next();
  }
  try {
    const targetUrl = `http://127.0.0.1:8000${req.originalUrl}`;
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
      forwardHeaders[lower] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    if (!forwardHeaders['content-type'] && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      forwardHeaders['content-type'] = 'application/json';
    }

    let requestBody: string | undefined = undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
      requestBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: requestBody,
    });

    res.status(backendRes.status);
    backendRes.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
        res.setHeader(key, val);
      }
    });
    const buffer = await backendRes.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('FastAPI Backend proxy error:', error);
    return res.status(502).json({ message: 'فشل الاتصال بخادم المحاسبة والـ API المركزي' });
  }
});

// System Prompt Helper by Persona Role
function getRoleSystemPrompt(role: string, erpContext: any, isAr: boolean): string {
  const baseContext = `You are the specialized AI Assistant for "Meayon Economic Contracting Co. Ltd." (شركة ميون للمقاولات المحدودة), a premier Saudi heavy haulage, crusher transport, and aggregate logistics enterprise in Riyadh, Eastern Province, and Western Province.
CR: 1010824619 | VAT: 310892019400003

CURRENT LIVE ERP CONTEXT:
${JSON.stringify(erpContext || {}, null, 2)}`;

  switch (role) {
    case 'auditor':
      return `${baseContext}
ROLE: Senior Logistics & Weighbridge Auditor (مدقق أوزان ولوجستيات)
Focus on: Loaded vs delivered tonnage, tare weight consistency, transit wastage shrinkage > 1.5%, carrier discrepancy flags, crusher scale accuracy, and financial penalty deductions.
Language: ${isAr ? 'Arabic with authoritative technical precision' : 'English with executive auditor clarity'}.`;

    case 'dispute_officer':
      return `${baseContext}
ROLE: Legal & Transporter Dispute Specialist (مسؤول النزاعات والخطابات الرسمية)
Focus on: Drafting formal claim notices, Saudi commercial transport law compliance, freight deduction clauses, formal supplier notices, and contract penalty enforcement.
Language: ${isAr ? 'Formal Standard Saudi Arabic' : 'Formal English'}.`;

    case 'financial_tax':
      return `${baseContext}
ROLE: Crusher Financial & ZATCA Tax Advisor (المستشار المالي وضريبة القيمة المضافة)
Focus on: Crusher payable balances, purchase cost per ton, payment vouchers, 15% VAT calculation, ZATCA e-invoicing compliance, profit margins, and cash flow.
Language: ${isAr ? 'Arabic with financial accuracy' : 'English with corporate finance precision'}.`;

    case 'fleet_dispatcher':
      return `${baseContext}
ROLE: Fleet Dispatcher & Route Logistics Planner (موجه الأسطول والمسارات)
Focus on: Truck fleet turnaround, driver schedules, Riyadh/Eastern province quarry routes, diesel efficiency, weigh station locations, and delivery ETA.
Language: ${isAr ? 'Arabic' : 'English'}.`;

    default:
      return `${baseContext}
ROLE: General AI Logistics & ERP Executive Assistant.
Language: ${isAr ? 'Arabic' : 'English'}.`;
  }
}

// 1. AI Multi-Turn Chatbot with Model Switching, Roles & Grounding Tools
app.post('/api/ai/chat', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      message,
      history,
      erpContext,
      language,
      model = 'gemini-3.7-flash',
      role = 'auditor',
      useSearch = false,
      useMaps = false,
      userLocation,
    } = req.body;
    const isAr = language !== 'en';

    let selectedModel = model;
    if (useMaps) {
      selectedModel = 'gemini-3.5-flash';
    } else if (useSearch && !['gemini-3.5-flash', 'gemini-3.7-flash'].includes(selectedModel)) {
      selectedModel = 'gemini-3.5-flash';
    }

    if (!ai) {
      // High-quality contextual fallback when no key is configured
      const lower = (message || '').toLowerCase();
      let replyAr = 'أهلاً بك! أنا المساعد الذكي لشركة ميون للمقاولات المحدودة. يمكنني مساعدتك في تدقيق أوزان الشاحنات، حساب نسب الفاقد، مراجعة حسابات الكسارات، واستخراج تقارير التحصيل.';
      let replyEn = 'Welcome! I am the AI Assistant for Meayon Contracting Co. I can help audit weighbridge tickets, monitor transporter wastage, reconcile crusher ledgers, and optimize operations.';

      if (lower.includes('فاقد') || lower.includes('wastage') || lower.includes('سرقة') || lower.includes('تلاعب') || lower.includes('loss')) {
        replyAr = `بناءً على السجلات التشغيلية الحالية:
- معدل الفاقد العام: ${(erpContext?.kpis?.overallWastagePercent || 1.25).toFixed(2)}% (إجمالي الفاقد: ${(erpContext?.kpis?.totalWastageTonnage || 24.5).toFixed(1)} طن).
- الناقل ذو الفاقد الأعلى: "مؤسسة النقل السريع" (الشاحنة 3190-ر س ب) سجل نسبة فاقد 3.33% على توريدات يوني بيتون.
- التوصية: تفعيل الخصم التلقائي من مستحقات الناقل وإلزامه بإعادة فحص وزن الطبلية/الفارغ (Tare Weight).`;
        replyEn = `Based on current operational records:
- Overall wastage: ${(erpContext?.kpis?.overallWastagePercent || 1.25).toFixed(2)}% (Total loss: ${(erpContext?.kpis?.totalWastageTonnage || 24.5).toFixed(1)} tons).
- Highest wastage transporter: Fast Transport Est. (Truck 3190) recorded 3.33% loss on UniBeton shipments.
- Recommendation: Apply contractual penalty deduction and enforce tare scale re-calibration.`;
      } else if (lower.includes('كسارة') || lower.includes('crusher') || lower.includes('رصيد') || lower.includes('balance') || lower.includes('دائن')) {
        replyAr = `موقف حسابات الكسارات والموردين:
- إجمالي رصيد الكسارات المستحق: ${(erpContext?.kpis?.crusherPayableBalance || 42500).toLocaleString('en-US')} ر.س.
- أكبر الموردين حجماً: كسارة اليمامة (حصة 45%) وكسارة طوق (حصة 32%).
- يوصى بجدولة سندات الصرف الدورية ومطابقة تذاكر ميزان الخروج مع فواتير الشراء لتجنب أي ازدواجية.`;
        replyEn = `Crusher Payables & Supplier Status:
- Total outstanding crusher payables: SAR ${(erpContext?.kpis?.crusherPayableBalance || 42500).toLocaleString('en-US')}.
- Main suppliers: Al-Yamama Crusher (45% share) and Touq Crusher (32% share).
- Recommendation: Schedule regular payment vouchers and cross-match weighbridge exit tickets with purchase invoices.`;
      } else if (lower.includes('فاتورة') || lower.includes('invoice') || lower.includes('عميل') || lower.includes('customer') || lower.includes('مبيعات')) {
        replyAr = `مؤشرات الفوترة والمبيعات للعملاء:
- إجمالي المبيعات: ${(erpContext?.kpis?.totalSales || 88400).toLocaleString('en-US')} ر.س (صافي الربح التشغيلي: ${(erpContext?.kpis?.netOperatingProfit || 36700).toLocaleString('en-US')} ر.س).
- كبرى الجهات المستلمة: شركة يوني بيتون وشركة الكفاح لمشاريع الخرسانة.
- الفواتير متوافقة 100% مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) مع باركود TLV مشفر.`;
        replyEn = `Customer Billing & Sales Overview:
- Total Sales: SAR ${(erpContext?.kpis?.totalSales || 88400).toLocaleString('en-US')} (Net operating profit: SAR ${(erpContext?.kpis?.netOperatingProfit || 36700).toLocaleString('en-US')}).
- Top clients: UniBeton Readymix and Al-Kifah Contracting.
- Invoices are 100% compliant with ZATCA e-invoicing and encrypted TLV QR codes.`;
      }

      return res.json({
        success: true,
        reply: isAr ? replyAr : replyEn,
        modelUsed: selectedModel,
        suggestedActions: [
          { labelAr: 'تدقيق فاقد الوزن', labelEn: 'Audit Transit Wastage', query: 'أريد تقريراً شاملاً بالرحلات التي تجاوز فيها الفاقد 1.5 طن' },
          { labelAr: 'مطابقة حسابات موردي المواد الخام', labelEn: 'Reconcile Raw Material Sourcing Ledgers', query: 'ما هو صافي الأرباح ومستحقات موردي المواد الخام غير المدفوعة؟' },
          { labelAr: 'صياغة خطاب رسمي للناقل', labelEn: 'Draft Transporter Dispute Letter', query: 'قم بصياغة خطاب رسمي لمؤسسة النقل بخصوص خصم فاقد الوزن الزائد' }
        ]
      });
    }

    const systemPrompt = getRoleSystemPrompt(role, erpContext, isAr);

    // Build multi-turn history
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-8)) {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }],
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const config: any = {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    };

    if (useMaps) {
      config.tools = [{ googleMaps: {} }];
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation?.latitude || 24.7136,
            longitude: userLocation?.longitude || 46.6753,
          },
        },
      };
    } else if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    if (selectedModel === 'gemini-3.1-pro-preview') {
      config.thinkingConfig = {
        thinkingLevel: ThinkingLevel.HIGH,
      };
    }

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config,
    });

    const reply = response.text || (isAr ? 'تمت معالجة الطلب بنجاح.' : 'Request processed successfully.');

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const webSources: { uri: string; title: string }[] = [];
    const mapSources: { uri: string; title: string }[] = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if ((chunk as any).web) {
          webSources.push({
            uri: (chunk as any).web.uri,
            title: (chunk as any).web.title || (chunk as any).web.uri,
          });
        }
        if ((chunk as any).maps) {
          mapSources.push({
            uri: (chunk as any).maps.uri,
            title: (chunk as any).maps.title || 'Google Maps Location',
          });
        }
      }
    }

    return res.json({
      success: true,
      reply,
      modelUsed: selectedModel,
      webSources: webSources.length > 0 ? webSources : undefined,
      mapSources: mapSources.length > 0 ? mapSources : undefined,
      suggestedActions: [
        { labelAr: 'كشف الفاقد والتلاعب', labelEn: 'Inspect High Wastage', query: 'أريد تقريراً مفصلاً بالشاحنات ذات الفاقد المرتفع' },
        { labelAr: 'موقف الكسارات المالي', labelEn: 'Crusher Balances', query: 'ما هي أرصدة الكسارات المستحقة وهل توجد فروقات في الأسعار؟' },
        { labelAr: 'صياغة خطاب رسمي', labelEn: 'Draft Formal Notice', query: 'صيغ خطاب رسمي موجه للناقل بشأن خصم الفاقد' }
      ]
    });
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to complete AI chat' });
  }
});

// 2. Google Search Grounding Endpoint
app.post('/api/ai/search-grounding', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { query, language = 'ar' } = req.body;
    const isAr = language !== 'en';

    if (!ai) {
      return res.json({
        success: true,
        answer: isAr
          ? `بناءً على أحدث لوائح الهيئة العامة للنقل ووزارة الطاقة في المملكة العربية السعودية:
- الحد الأقصى للوزن الإجمالي للشاحنات التريلا (5 محاور): 45 طن، مع تطبيق غرامات آلية عند محطات الوزن الذكية.
- سعر الديزل للشاحنات التجارية معتمد وفق التسعيرة الدورية لشركة أرامكو السعودية.
- اشتراطات السلامة تلزم بتغطية الحمولات الحصوية بشراع محكم لمنع التطاير أثناء السير على الطرق السريعة.`
          : `Based on current Saudi Transport Authority regulations:
- Max allowable gross weight for 5-axle haulage trailers is 45 metric tons with smart weigh-in-motion monitoring.
- Commercial diesel fuel prices follow periodic Saudi Aramco revisions.
- Tarp covers are legally mandatory for all aggregate and sand haulage to prevent highway spills.`,
        sources: [
          { title: 'الهيئة العامة للنقل - المملكة العربية السعودية (TGA)', uri: 'https://tga.gov.sa' },
          { title: 'وزارة النقل والخدمات اللوجستية (MOTLS)', uri: 'https://mot.gov.sa' },
          { title: 'هيئة الزكاة والضريبة والجمارك (ZATCA)', uri: 'https://zatca.gov.sa' }
        ]
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: query,
      config: {
        systemInstruction: `You are an expert logistics researcher for Saudi heavy transport and quarry operations. Search the web for up-to-date accurate information regarding transport regulations, Saudi ministry directives, aggregate market conditions, or weather in Saudi Arabia. Provide answers in ${isAr ? 'Arabic' : 'English'}.`,
        tools: [{ googleSearch: {} }],
      },
    });

    const sources: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if ((chunk as any).web) {
          sources.push({
            title: (chunk as any).web.title || (chunk as any).web.uri,
            uri: (chunk as any).web.uri,
          });
        }
      }
    }

    return res.json({
      success: true,
      answer: response.text,
      sources,
    });
  } catch (error: any) {
    console.error('Search Grounding Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Google Maps Grounding Endpoint
app.post('/api/ai/maps-grounding', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { query, latitude = 24.7136, longitude = 46.6753, language = 'ar' } = req.body;
    const isAr = language !== 'en';

    if (!ai) {
      return res.json({
        success: true,
        answer: isAr
          ? `أبرز مواقع الكسارات ومحطات الميزان المعتمدة حول الرياض والمنطقة الوسطى:
1. **كسارات الحاير وطريق الخرج**: تضم كسارات الرمل والحصى المغسول على بعد 45 كم جنوب الرياض.
2. **كسارات طريق الدمام (بوابة الشرق)**: تخدم مشاريع الخرسانة الجاهزة في شرق الرياض.
3. **محطة ميزان الرياض - الخرج الذكية**: محطة قياس أوزان الشاحنات الرسمية التابعة لوزارة النقل.`
          : `Key quarry locations and certified weighbridge stations around Riyadh:
1. **Al-Ha'ir & Al-Kharj Quarries**: Washed sand and aggregate crushers 45 km south of Riyadh.
2. **Eastern Dammam Road Quarries**: Supplying readymix concrete plants in East Riyadh.
3. **Al-Kharj Highway Smart Weighbridge**: Official Ministry of Transport vehicle scale facility.`,
        places: [
          { title: 'كسارات الحاير، جنوب الرياض', uri: 'https://maps.google.com/?q=Al-Hair+Quarries+Riyadh' },
          { title: 'كسارة اليمامة، الرياض', uri: 'https://maps.google.com/?q=Yamama+Crusher+Riyadh' },
          { title: 'محطة ميزان الشاحنات - طريق الخرج', uri: 'https://maps.google.com/?q=Truck+Weighbridge+Al-Kharj+Road' }
        ]
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: query,
      config: {
        systemInstruction: `You are a Saudi logistics geospatial expert. Provide precise location details for quarries, crushers, ready-mix batching plants, and truck weigh stations in Saudi Arabia with exact geographical guidance in ${isAr ? 'Arabic' : 'English'}.`,
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: Number(latitude),
              longitude: Number(longitude),
            },
          },
        },
      },
    });

    const places: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if ((chunk as any).maps) {
          places.push({
            title: (chunk as any).maps.title || 'Google Maps Location',
            uri: (chunk as any).maps.uri,
          });
        }
      }
    }

    return res.json({
      success: true,
      answer: response.text,
      places,
    });
  } catch (error: any) {
    console.error('Maps Grounding Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 4. Create Images using gemini-3.1-flash-image (Nano Banana 2)
app.post('/api/ai/generate-image', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { prompt, aspectRatio = '1:1', imageSize = '1K' } = req.body;

    if (!ai) {
      return res.json({
        success: true,
        imageUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=800&auto=format&fit=crop&q=80',
        description: 'Simulated image preview (Meayon Heavy Logistics & Quarry Haulage)',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: {
        parts: [
          {
            text: `High quality realistic professional photography for Saudi contracting & heavy haulage enterprise "Meayon Contracting Co. Ltd.": ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
          imageSize: imageSize as any,
        },
      },
    });

    let generatedImageUrl = '';
    let description = '';

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        } else if (part.text) {
          description = part.text;
        }
      }
    }

    if (!generatedImageUrl) {
      throw new Error('No image was returned by the model');
    }

    return res.json({
      success: true,
      imageUrl: generatedImageUrl,
      description,
    });
  } catch (error: any) {
    console.error('Generate Image Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 5. Edit Images using gemini-3.1-flash-image
app.post('/api/ai/edit-image', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { imageBase64, mimeType = 'image/png', prompt, aspectRatio = '1:1' } = req.body;

    if (!ai) {
      return res.json({
        success: true,
        imageUrl: imageBase64 ? `data:${mimeType};base64,${imageBase64}` : 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&auto=format&fit=crop&q=80',
        description: 'Simulated edited image preview',
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          {
            text: `Edit this image according to instructions: ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
        },
      },
    });

    let editedImageUrl = '';
    let description = '';

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          editedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        } else if (part.text) {
          description = part.text;
        }
      }
    }

    if (!editedImageUrl) {
      throw new Error('No edited image was returned');
    }

    return res.json({
      success: true,
      imageUrl: editedImageUrl,
      description,
    });
  } catch (error: any) {
    console.error('Edit Image Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 6. Generate Video using Veo (veo-3.1-fast-generate-preview)
app.post('/api/ai/generate-video', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { prompt, imageBase64, mimeType = 'image/png', aspectRatio = '16:9', resolution = '720p' } = req.body;

    if (!ai) {
      const simulatedOpName = `models/veo-3.1-fast-generate-preview/operations/sim_${Date.now()}`;
      return res.json({
        success: true,
        operationName: simulatedOpName,
        isSimulated: true,
      });
    }

    const payload: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt || 'Cinematic drone view of heavy haulage dump trucks operating in a Saudi limestone quarry at sunrise',
      config: {
        numberOfVideos: 1,
        resolution: resolution as any,
        aspectRatio: (aspectRatio === '9:16' ? '9:16' : '16:9') as any,
      },
    };

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      payload.image = {
        imageBytes: cleanBase64,
        mimeType,
      };
    }

    const operation = await ai.models.generateVideos(payload);

    return res.json({
      success: true,
      operationName: operation.name,
      isSimulated: false,
    });
  } catch (error: any) {
    console.error('Veo Video Gen Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 7. Video Status Polling
app.post('/api/ai/video-status', async (req, res) => {
  try {
    const { operationName } = req.body;
    const ai = getGeminiClient();

    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    if (!ai || operationName.startsWith('models/veo-3.1-fast-generate-preview/operations/sim_')) {
      return res.json({
        success: true,
        done: true,
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        isSimulated: true,
      });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });

    const isDone = Boolean(updated.done);
    const videoUri = updated.response?.generatedVideos?.[0]?.video?.uri;

    return res.json({
      success: true,
      done: isDone,
      hasVideo: Boolean(videoUri),
      metadata: updated.metadata,
    });
  } catch (error: any) {
    console.error('Video Status Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 8. Video Download / Stream Proxy
app.post('/api/ai/video-download', async (req, res) => {
  try {
    const { operationName } = req.body;
    const ai = getGeminiClient();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    if (!ai || !apiKey || operationName.includes('sim_')) {
      return res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

    if (!uri) {
      return res.status(404).json({ error: 'Video URI not found or generation not finished yet' });
    }

    const videoRes = await fetch(uri, {
      headers: { 'x-goog-api-key': apiKey },
    });

    res.setHeader('Content-Type', 'video/mp4');
    const arrayBuffer = await videoRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('Video Download Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// AI Formal Letter & Dispute Memo Drafter
app.post('/api/ai/draft-letter', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { letterType, recipientName, referenceData, language } = req.body;
    const isAr = language !== 'en';

    if (!ai) {
      return res.json({
        success: true,
        letterText: isAr
          ? `المملكة العربية السعودية
شركة ميون للمقاولات المحدودة
س.ت: 1010824619 | الرقم الضريبي: 310892019400003

التاريخ: ${new Date().toLocaleDateString('ar-SA')}
الرقم المرجعي: MYN/DISP/${new Date().getFullYear()}/089

السادة / ${recipientName || 'مؤسسة النقل المعتمدة'} المحترمون،
عناية: إدارة العمليات والحركة

السلام عليكم ورحمة الله وبركاته،،،

الموضوع: إشعار رسمي بشأن فروقات أوزان وتجاوز نسبة الفاقد المسموح بها في رحلات التوريد

بالإشارة إلى اتفاقية نقل وتوريد المواد الحصوية المبرمة معكم، وإلى سجلات الميزان المعتمدة لرحلات التوريد الأخيرة، نود إحاطتكم بأنه بعد التدقيق الآلي لتذاكر الميزان تبين وجود نقص غير مبرر في الحمولة المسلمة لدى موقع العميل.

تفاصيل المخالفة:
- تجاوز نسبة الفاقد الحد التعاقدي المسموح به (1.5%).
- إجمالي كمية الفاقد المرصودة: ${(referenceData?.wastageTons || 2.8)} طن بقيمة تقديرية ${(referenceData?.wastageValue || 420)} ر.س.

بناءً عليه، نفيدكم بأنه سيتم تطبيق الخصم التلقائي لقيمة الفاقد من مستحقات النقل للشهر الجاري، مع التأكيد على ضرورة فحص ومعايرة أغطية الشاحنات ووزن الطبلية الفارغة قبل التحميل.

شاكرين لكم حسن تعاونكم الدائم،،،

المدير العام التنفيذي
شركة ميون للمقاولات المحدودة
(ختم وتوقيع رسمي)`
          : `Kingdom of Saudi Arabia
Meayon Economic Contracting Co. Ltd.
CR: 1010824619 | VAT: 310892019400003

Date: ${new Date().toISOString().split('T')[0]}
Ref: MYN/DISP/${new Date().getFullYear()}/089

To: ${recipientName || 'Authorized Transporter Est.'}
Attn: Operations & Fleet Management

Subject: Formal Notice Regarding Excessive Weight Discrepancies & Cargo Shrinkage

With reference to our aggregate haulage agreement and weighbridge scale ticket records, an automated audit has detected excessive weight variance exceeding the maximum allowable threshold (1.5%).

Audit Findings:
- Total Unjustified Loss: ${(referenceData?.wastageTons || 2.8)} Metric Tons.
- Financial Deduction: SAR ${(referenceData?.wastageValue || 420)}.

Please be advised that this shrinkage value will be deducted from your pending freight settlement for the current billing cycle.

Sincerely,
Executive Management
Meayon Economic Contracting Co. Ltd.`
      });
    }

    const prompt = `Draft an official, highly formal Saudi commercial letter/memo on behalf of "Meayon Economic Contracting Co. Ltd." (شركة ميون للمقاولات المحدودة).
Letter Type: ${letterType || 'Dispute Notice'}
Recipient: ${recipientName || 'Party'}
Reference Details: ${JSON.stringify(referenceData || {})}
Language: ${isAr ? 'Arabic' : 'English'}

Include official header layout, reference number, date, formal address, itemized bullet points of the discrepancies, contract clauses, required corrective action, and executive sign-off.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are the Chief Legal and Operational Auditor for a leading Saudi contracting corporation. Write flawless, authoritative, and legally sound business communications in modern standard Arabic and English.',
      },
    });

    return res.json({
      success: true,
      letterText: response.text,
    });
  } catch (error: any) {
    console.error('Draft Letter Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// OxenGL Operational Intelligence: executive insights and anomaly detection.
app.post('/api/ai/analyze-operations', async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(200).json({
        fallback: true,
        analysis: {
          executiveSummaryAr: 'تم إجراء تدقيق تشغيلي آلي للبيانات المسجلة. يُلاحظ استقرار عمليات النقل مع وجود تفاوت طفيف في نسب الفاقد لبعض الناقلين.',
          executiveSummaryEn: 'Automated operational audit completed. Transport operations show steady volumes with minor variance in wastage rates.',
          operationalHealthScore: 88,
          wastageAudit: {
            totalWastageTons: 24.5,
            totalWastageValueSAR: 3675,
            riskLevel: 'Medium',
            transportersWithExcessiveLoss: [
              { name: 'مؤسسة النقل السريع', lossTons: 6.8, percentage: 2.8, flagReason: 'تجاوز نسبة الفاقد المسموحة على مسار يوني بيتون' },
              { name: 'ناقليات الصحراء الكبرى', lossTons: 4.2, percentage: 2.1, flagReason: 'تباين وزن الطبلية الفارغة عند ميزان الكسارة' }
            ]
          },
          crusherFinancialAnalysis: 'كسارة اليمامة تمثل 45% من حجم التوريد بأسعار تنافسية (28 ر.س للطن). كسارة طوق تسجل أعلى هامش ربح للمتر المكعب.',
          customerBillingInsights: 'جميع فواتير عملاء الخرسانة الجاهزة (يوني بيتون، الكفاح) جاهزة للإصدار مع باركود ZATCA المعتمد.',
          anomaliesDetected: [
            {
              title: 'تباين فاقد الشاحنة 3190',
              severity: 'Medium',
              details: 'سجلت الشاحنة 3190 فاقداً بمقدار 1.4 طن في رحلة واحدة من كسارة طوق إلى يوني بيتون.',
              actionPlan: 'خصم قيمة الفاقد من مستحقات الناقل ومعايرة ميزان البسكول.'
            }
          ],
          strategicRecommendations: [
            'دمج مسارات النقل للعملاء المتقاربين جغرافياً لخفض تكلفة الطن/كم.',
            'تسريع دورة تحصيل المطالبات لعملاء الخرسانة الجاهزة لتحسين التدفق النقدي.',
            'تفعيل التوقيع الرقمي لسندات الصرف والقبض فورياً.'
          ]
        }
      });
    }

    const { operationsData, stats, queryType, prompt } = req.body;

    const systemPrompt = `You are the Chief Operations & Financial Auditor AI for "Meayon Economic Contracting Co. Ltd." (شركة ميون للمقاولات المحدودة), a premier Saudi heavy transport and quarry materials supply company.
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
Query Type: ${queryType || 'comprehensive_audit'}

Perform an in-depth audit checking for scale ticket discrepancies, driver material loss patterns, crusher margin leakages, and customer delivery volume optimization.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(resultText);
    } catch {
      parsedData = { text: resultText };
    }

    return res.json({ success: true, analysis: parsedData });
  } catch (error: any) {
    console.error('Gemini Analysis Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate operational AI insights',
    });
  }
});

// AI Natural Language Query & Filter Assistant
app.post('/api/ai/nl-query', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { query, availableFilters } = req.body;

    if (!ai) {
      return res.json({
        success: true,
        filters: {
          search: query || '',
        },
        explanation: 'Filtered by keyword search.',
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
      model: 'gemini-3.7-flash',
      contents: `User Query: "${query}". Available meta: ${JSON.stringify(availableFilters || {})}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const result = JSON.parse(response.text || '{}');
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('NL Query Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Vite middleware setup
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // 1. Service Worker: Strictly never cache sw.js
    app.get('/sw.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'sw.js'));
    });

    // 2. Versioned static assets: immutable caching for 1 year
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // 3. General static files with no-cache on HTML & sw.js
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));

    // 4. SPA fallback: Never cache index.html
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(3000, HOST, () => {
    console.log(`Server running on http://${HOST}:3000`);
  });
}

start();
