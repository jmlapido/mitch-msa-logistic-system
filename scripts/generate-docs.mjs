#!/usr/bin/env node
/**
 * MSA Logistic — PDF User Guide Generator
 * Takes live screenshots from the running dev server and composes an A4 PDF.
 * Run: node scripts/generate-docs.mjs
 * Requires: dev server on http://localhost:5173 + API on http://localhost:8787
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'app-submission');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'MSA-Logistic-UserGuide.pdf');
const TEMP_HTML  = path.join(OUTPUT_DIR, '_tmp-doc.html');
const BASE_URL   = 'http://localhost:5173';
const EMAIL      = 'admin@example.com';
const PASSWORD   = 'Admin@1234';

// ─── helpers ────────────────────────────────────────────────────────────────

async function snap(page, timeout = 2000) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(timeout);
  return (await page.screenshot({ fullPage: false })).toString('base64');
}

function img(b64) {
  if (!b64) return '<div style="height:200px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">Screenshot not available</div>';
  return `<img src="data:image/png;base64,${b64}" style="width:100%;border-radius:8px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />`;
}

function featureList(items) {
  return `<div class="features">${items.map(([label, desc, ar]) => `
    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <span class="label">${label}</span> — ${desc}
        <span class="label-ar">${ar}</span>
      </div>
    </div>`).join('')}</div>`;
}

function pageHeader(section, title) {
  return `<div class="page-header">
    <span class="page-header-section">${section}</span>
    <span class="page-header-brand">MSA Logistic System</span>
  </div>
  <div class="section-header">
    <div class="section-title">${title.en}</div>
    <div class="section-title-ar">${title.ar}</div>
  </div>`;
}

function bilingualDesc(en, ar) {
  return `<div class="bilingual">
    <div class="en">${en}</div>
    <div class="ar" dir="rtl">${ar}</div>
  </div>`;
}

// ─── screenshot phase ────────────────────────────────────────────────────────

async function captureAll() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  // Login
  console.log('  🔐 Logging in…');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 15000 });
  } catch {
    throw new Error('Login failed — check credentials or that the API server is running on port 8787');
  }
  console.log('  ✅ Logged in');

  const ss = {};

  console.log('  📸 Dashboard…');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  ss.dashboard = await snap(page, 2500);

  console.log('  📸 Bills…');
  await page.goto(`${BASE_URL}/bills`, { waitUntil: 'domcontentloaded' });
  ss.bills = await snap(page, 2000);

  console.log('  📸 Rentals — Payments…');
  await page.goto(`${BASE_URL}/rentals`, { waitUntil: 'domcontentloaded' });
  ss.rentalsPayments = await snap(page, 2000);

  console.log('  📸 Rentals — Tenants…');
  try {
    await page.getByRole('tab', { name: 'Tenants' }).click();
    ss.rentalsTenants = await snap(page, 2000);
  } catch { ss.rentalsTenants = null; }

  console.log('  📸 Rentals — Buildings…');
  try {
    await page.getByRole('tab', { name: 'Buildings' }).click();
    ss.rentalsBuildings = await snap(page, 2000);
  } catch { ss.rentalsBuildings = null; }

  console.log('  📸 Rentals — Units…');
  try {
    await page.getByRole('tab', { name: 'Units' }).click();
    ss.rentalsUnits = await snap(page, 2000);
  } catch { ss.rentalsUnits = null; }

  console.log('  📸 Sponsorships…');
  await page.goto(`${BASE_URL}/partners`, { waitUntil: 'domcontentloaded' });
  ss.partners = await snap(page, 2000);

  console.log('  📸 Sponsorship Payments…');
  try {
    await page.getByRole('tab', { name: 'Payments' }).click();
    ss.partnersPayments = await snap(page, 1500);
  } catch { ss.partnersPayments = null; }

  console.log('  📸 Reports…');
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
  ss.reports = await snap(page, 2000);

  console.log('  📸 Settings…');
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  ss.settings = await snap(page, 2000);

  console.log('  📸 Audit Logs…');
  await page.goto(`${BASE_URL}/logs`, { waitUntil: 'domcontentloaded' });
  ss.auditLogs = await snap(page, 2000);

  await browser.close();
  return ss;
}

// ─── HTML template ───────────────────────────────────────────────────────────

function buildHTML(ss) {
  const dateEn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const css = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#fff; color:#1e293b; }

    .page {
      width:210mm; min-height:297mm; padding:14mm 18mm;
      page-break-after:always;
      display:flex; flex-direction:column; gap:14px;
    }

    /* ── Cover ── */
    .cover {
      background:linear-gradient(145deg,#0f172a 0%,#1e3a5f 55%,#1d4ed8 100%);
      color:#fff; padding:0; gap:0; justify-content:space-between;
    }
    .cover-body {
      flex:1; display:flex; flex-direction:column; align-items:center;
      justify-content:center; gap:22px; padding:50mm 28mm 30mm;
    }
    .cover-badge {
      background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3);
      font-size:10px; letter-spacing:3px; text-transform:uppercase;
      padding:5px 18px; border-radius:20px;
    }
    .cover-title { font-size:40px; font-weight:700; line-height:1.15; text-align:center; }
    .cover-title-ar {
      font-family:'Noto Sans Arabic',sans-serif; font-size:28px; font-weight:600;
      opacity:.8; direction:rtl; text-align:center;
    }
    .cover-divider { width:60px; height:3px; background:rgba(255,255,255,.35); border-radius:2px; }
    .cover-sub { font-size:17px; font-weight:300; opacity:.75; text-align:center; }
    .cover-sub-ar {
      font-family:'Noto Sans Arabic',sans-serif; font-size:14px; opacity:.65;
      direction:rtl; text-align:center;
    }
    .cover-meta { font-size:11px; opacity:.55; text-align:center; }
    .cover-footer {
      padding:14px 18mm; border-top:1px solid rgba(255,255,255,.15);
      display:flex; justify-content:space-between; font-size:10px; opacity:.55;
    }

    /* ── Page header strip ── */
    .page-header {
      display:flex; justify-content:space-between; align-items:center;
      padding-bottom:9px; border-bottom:1px solid #e2e8f0; margin-bottom:2px;
    }
    .page-header-section { font-size:10px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:1.2px; }
    .page-header-brand { font-size:10px; color:#2563eb; font-weight:700; }

    /* ── Section header ── */
    .section-header { border-left:4px solid #2563eb; padding-left:12px; }
    .section-title { font-size:20px; font-weight:700; color:#0f172a; }
    .section-title-ar {
      font-family:'Noto Sans Arabic',sans-serif; font-size:14px; color:#64748b;
      direction:rtl; margin-top:1px;
    }

    /* ── Bilingual text ── */
    .bilingual { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .bilingual .en { font-size:12px; line-height:1.75; color:#334155; }
    .bilingual .ar {
      font-family:'Noto Sans Arabic',sans-serif; font-size:12px; line-height:1.85;
      color:#334155; direction:rtl; text-align:right;
    }

    /* ── Feature grid ── */
    .features { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; }
    .feature { display:flex; gap:9px; align-items:flex-start; }
    .feature-dot { width:7px; height:7px; border-radius:50%; background:#2563eb; margin-top:4px; flex-shrink:0; }
    .feature-text { font-size:11.5px; color:#334155; line-height:1.45; }
    .feature-text .label { font-weight:600; color:#0f172a; }
    .feature-text .label-ar {
      font-family:'Noto Sans Arabic',sans-serif; font-size:10.5px; color:#64748b;
      direction:rtl; display:block; margin-top:1px;
    }

    /* ── Screenshot ── */
    .screenshot-wrap { margin-top:2px; }

    /* ── Overview ── */
    .overview-box {
      background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:16px 18px;
    }
    .overview-en { font-size:12.5px; line-height:1.8; color:#334155; margin-bottom:12px; }
    .overview-ar {
      font-family:'Noto Sans Arabic',sans-serif; font-size:12.5px; line-height:1.9;
      color:#334155; direction:rtl; text-align:right;
    }

    /* ── Capability cards ── */
    .caps { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .cap {
      background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;
      padding:12px 10px; text-align:center;
    }
    .cap-icon { font-size:22px; margin-bottom:5px; }
    .cap-title { font-size:11px; font-weight:600; color:#0f172a; }
    .cap-title-ar { font-family:'Noto Sans Arabic',sans-serif; font-size:10px; color:#64748b; direction:rtl; margin-top:1px; }

    /* ── TOC ── */
    .toc-row {
      display:flex; justify-content:space-between; align-items:center;
      padding:8px 0; border-bottom:1px dotted #e2e8f0; font-size:13px;
    }
    .toc-num { color:#2563eb; font-weight:700; margin-right:10px; }
    .toc-ar { font-family:'Noto Sans Arabic',sans-serif; font-size:12px; color:#64748b; }

    /* ── Tab label ── */
    .tab-label {
      font-size:12px; font-weight:600; color:#2563eb; margin:10px 0 4px;
      display:flex; align-items:center; gap:8px;
    }
    .tab-label-ar { font-family:'Noto Sans Arabic',sans-serif; font-size:11px; color:#475569; }

    /* ── User guide steps ── */
    .guide-section-title {
      font-size:13px; font-weight:700; color:#0f172a; margin-top:18px; margin-bottom:10px;
    }
    .guide-section-title-ar { font-family:'Noto Sans Arabic',sans-serif; font-size:11px; color:#475569; display:block; }
    .steps { display:flex; flex-direction:column; gap:10px; }
    .step { display:flex; gap:12px; align-items:flex-start; }
    .step-num {
      width:24px; height:24px; border-radius:50%; background:#2563eb; color:#fff;
      font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .step-body { flex:1; padding-top:2px; }
    .step-title { font-size:12.5px; font-weight:600; color:#0f172a; }
    .step-title-ar { font-family:'Noto Sans Arabic',sans-serif; font-size:11px; color:#475569; display:block; }
    .step-desc { font-size:11.5px; color:#64748b; margin-top:2px; line-height:1.5; }
    .step-desc-ar { font-family:'Noto Sans Arabic',sans-serif; font-size:10.5px; color:#94a3b8; display:block; }

    /* ── Role table ── */
    table { width:100%; border-collapse:collapse; font-size:11.5px; }
    th { background:#0f172a; color:#fff; padding:9px 12px; font-weight:600; text-align:left; }
    th.center { text-align:center; }
    td { padding:8px 12px; border-bottom:1px solid #e2e8f0; }
    td.center { text-align:center; }
    tr:nth-child(even) td { background:#f8fafc; }
    .check { color:#16a34a; font-size:15px; }
    .cross { color:#dc2626; font-size:15px; }

    /* ── Back cover ── */
    .back-cover {
      background:linear-gradient(145deg,#0f172a,#1e3a5f);
      color:#fff; align-items:center; justify-content:center; text-align:center; gap:16px;
    }

    @page { size:A4; margin:0; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  `;

  const steps = (list) => list.map(([n, en, ar, desc, descAr]) => `
    <div class="step">
      <div class="step-num">${n}</div>
      <div class="step-body">
        <div class="step-title">${en} <span class="step-title-ar">${ar}</span></div>
        <div class="step-desc">${desc} <span class="step-desc-ar">${descAr}</span></div>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>

<!-- ══════════════════════════════════ COVER ══════════════════════════════════ -->
<div class="page cover">
  <div class="cover-body">
    <div class="cover-badge">MSA Logistic System</div>
    <div class="cover-title">Property &amp; Rental<br>Management System</div>
    <div class="cover-title-ar">نظام إدارة العقارات والإيجارات</div>
    <div class="cover-divider"></div>
    <div class="cover-sub">Application Features &amp; User Guide</div>
    <div class="cover-sub-ar">دليل الميزات والمستخدم للتطبيق</div>
    <div class="cover-meta">${dateEn} &nbsp;·&nbsp; Version 1.0</div>
  </div>
  <div class="cover-footer">
    <span>Designed &amp; Developed by JMLapido</span>
    <span>Confidential — For Internal Use</span>
    <span>${dateEn}</span>
  </div>
</div>

<!-- ══════════════════════════════════ TOC ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Contents', { en: 'Table of Contents', ar: 'فهرس المحتويات' })}
  <div style="display:flex;flex-direction:column;gap:2px;margin-top:10px;">
    ${[
      [1,'System Overview','نظرة عامة على النظام'],
      [2,'Dashboard','لوحة التحكم'],
      [3,'Bills Management','إدارة الفواتير'],
      [4,'Rentals Management','إدارة الإيجارات'],
      [5,'Sponsorships','الرعايات'],
      [6,'Reports','التقارير'],
      [7,'Settings','الإعدادات'],
      [8,'Audit Logs','سجلات التدقيق'],
      [9,'User Guide','دليل المستخدم'],
      [10,'Role &amp; Access Matrix','مصفوفة الأدوار والصلاحيات'],
    ].map(([n,en,ar]) => `
      <div class="toc-row">
        <div><span class="toc-num">${n}.</span>${en}</div>
        <div class="toc-ar">${ar}</div>
      </div>`).join('')}
  </div>
</div>

<!-- ══════════════════════════════ SYSTEM OVERVIEW ══════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 1', { en: 'System Overview', ar: 'نظرة عامة على النظام' })}
  <div class="overview-box">
    <div class="overview-en">
      MSA Logistic is a comprehensive web-based Financial, Property &amp; Sponsorship management
      system built for MSA Logistic Company. It provides a centralized platform to manage
      buildings, rental units, tenants, lease contracts, utility bills, sponsorship partners,
      and financial reporting — all from a single secure interface accessible from any browser.
    </div>
    <div class="overview-ar">
      نظام MSA اللوجستي هو نظام شامل للإدارة المالية والعقارية والرعاية عبر الإنترنت، مُصمَّم
      خصيصًا لشركة MSA اللوجستية. يوفر النظام منصة مركزية لإدارة المباني ووحدات الإيجار والمستأجرين
      وعقود الإيجار والفواتير وشركاء الرعاية والتقارير المالية — كل ذلك من واجهة آمنة واحدة
      يمكن الوصول إليها من أي متصفح.
    </div>
  </div>
  <div class="caps">
    ${[
      ['🏢','Buildings &amp; Units','المباني والوحدات'],
      ['👥','Tenant Management','إدارة المستأجرين'],
      ['📋','Lease Contracts','عقود الإيجار'],
      ['💰','Bills &amp; Payments','الفواتير والمدفوعات'],
      ['🤝','Sponsorships','الرعايات'],
      ['📊','Financial Reports','التقارير المالية'],
    ].map(([icon,en,ar]) => `
      <div class="cap">
        <div class="cap-icon">${icon}</div>
        <div class="cap-title">${en}</div>
        <div class="cap-title-ar">${ar}</div>
      </div>`).join('')}
  </div>
  <div>
    <div class="section-header" style="margin-bottom:10px;">
      <div class="section-title" style="font-size:15px">Technology Stack</div>
      <div class="section-title-ar">التقنيات المستخدمة</div>
    </div>
    ${featureList([
      ['Frontend','React 18 + TypeScript + Tailwind CSS','الواجهة الأمامية'],
      ['Backend','Hono.js on Cloudflare Workers','الواجهة الخلفية'],
      ['Database','Cloudflare D1 (SQLite)','قاعدة البيانات'],
      ['File Storage','Cloudflare R2 Object Storage','تخزين الملفات'],
      ['Hosting','Cloudflare Edge Network (Global CDN)','الاستضافة'],
      ['Authentication','Session-based with role access control','المصادقة والتحكم في الوصول'],
    ])}
  </div>
</div>

<!-- ══════════════════════════════════ DASHBOARD ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 2', { en: 'Dashboard', ar: 'لوحة التحكم' })}
  ${bilingualDesc(
    'The Dashboard provides a real-time summary of all key business metrics for the selected month. Use the arrow controls to navigate between months. Click any widget to jump directly to the relevant detail page.',
    'توفر لوحة التحكم ملخصًا فوريًا لجميع مقاييس الأعمال الرئيسية للشهر المحدد. استخدم أزرار الأسهم للتنقل بين الأشهر. انقر على أي أداة للانتقال مباشرة إلى صفحة التفاصيل ذات الصلة.'
  )}
  <div class="screenshot-wrap">${img(ss.dashboard)}</div>
  ${featureList([
    ['Stat Cards','Bills &amp; rent KPIs with month-over-month delta indicators','بطاقات الإحصاء'],
    ['Bills Donut Chart','Visual breakdown of paid vs. unpaid bills','مخطط الفواتير الدائري'],
    ['Rent Bar Chart','Monthly rent collection per building','مخطط الإيجار الشريطي'],
    ['Trend Charts','Bills &amp; rent trend lines across months','مخططات الاتجاهات'],
    ['Priority Payments','Overdue and urgent payment alerts','المدفوعات ذات الأولوية'],
    ['Upcoming Bills','Bills due in the next 7 days','الفواتير القادمة'],
    ['Expiring Leases','Leases expiring within 30 days','العقود المنتهية قريبًا'],
    ['Building Occupancy','Occupied vs. vacant units per building','إشغال المباني'],
    ['Active Sponsors','Current active sponsorship partners','الرعاة النشطون'],
    ['Expiring Sponsors','Sponsorships nearing expiry with day counts','الرعايات المنتهية قريبًا'],
  ])}
</div>

<!-- ══════════════════════════════════ BILLS ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 3', { en: 'Bills Management', ar: 'إدارة الفواتير' })}
  ${bilingualDesc(
    'Manage all utility bills and recurring expenses month-by-month. Track paid and unpaid status, attach invoice images, and view a running total sidebar broken down by category.',
    'إدارة جميع فواتير المرافق والمصروفات المتكررة شهرًا بشهر. تتبع حالة الدفع، وإرفاق صور الفواتير، وعرض شريط إجمالي جانبي مقسّم حسب الفئة.'
  )}
  <div class="screenshot-wrap">${img(ss.bills)}</div>
  ${featureList([
    ['Monthly Navigation','Browse bills per month using prev/next arrows','التنقل الشهري'],
    ['Add Bill','Create entries with name, category, amount, and due date','إضافة فاتورة'],
    ['Edit / Delete','Modify or remove any bill entry','تعديل وحذف'],
    ['Mark as Paid','Record payment date and settle the bill','تسجيل الدفع'],
    ['Invoice Attachments','Upload and view invoice image files','المرفقات'],
    ['Totals Sidebar','Total / Paid / Outstanding summary panel','ملخص الإجماليات'],
    ['Status Filters','Filter table by Paid, Unpaid, or All','فلاتر الحالة'],
    ['Bill Templates','Reuse saved templates for recurring entries','قوالب الفواتير'],
  ])}
</div>

<!-- ══════════════════════════════════ RENTALS ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 4', { en: 'Rentals Management', ar: 'إدارة الإيجارات' })}
  ${bilingualDesc(
    'Full rental lifecycle management across five tabs. Record rent collections, manage tenant profiles with their lease documents, PDC cheques, and identification files. Browse building and unit inventory.',
    'إدارة شاملة لدورة حياة الإيجار عبر خمس علامات تبويب. تسجيل تحصيل الإيجار، وإدارة ملفات المستأجرين مع وثائق العقود والشيكات المؤجلة ومستندات الهوية. تصفح مخزون المباني والوحدات.'
  )}
  <div class="tab-label">Payments Tab <span class="tab-label-ar">— علامة المدفوعات</span></div>
  <div class="screenshot-wrap">${img(ss.rentalsPayments)}</div>
</div>

<div class="page">
  ${pageHeader('Section 4 (cont.)', { en: 'Rentals — Tenants &amp; Buildings', ar: 'الإيجارات — المستأجرون والمباني' })}
  <div class="tab-label">Tenants Tab <span class="tab-label-ar">— علامة المستأجرين</span></div>
  <div class="screenshot-wrap">${img(ss.rentalsTenants)}</div>
  <div class="tab-label" style="margin-top:12px">Buildings Tab <span class="tab-label-ar">— علامة المباني</span></div>
  <div class="screenshot-wrap">${img(ss.rentalsBuildings)}</div>
</div>

<div class="page">
  ${pageHeader('Section 4 (cont.)', { en: 'Rentals — Features', ar: 'الإيجارات — الميزات' })}
  <div class="tab-label">Units Tab <span class="tab-label-ar">— علامة الوحدات</span></div>
  <div class="screenshot-wrap">${img(ss.rentalsUnits)}</div>
  ${featureList([
    ['Rent Payments','Record and track monthly rent per tenant','تسجيل مدفوعات الإيجار'],
    ['Tenant Profiles','Full contact info and active lease status','ملفات المستأجرين'],
    ['Lease Contracts','Upload and manage signed lease PDFs','عقود الإيجار'],
    ['PDC Cheques','Track post-dated cheque payment schedules','الشيكات المؤجلة'],
    ['KYC Documents','Attach tenant ID and supporting documents','وثائق الهوية'],
    ['Buildings','View building details and occupancy rates','المباني والإشغال'],
    ['Units','Browse all rental units with status','وحدات الإيجار'],
    ['Archive','Archive and retrieve expired lease records','أرشفة العقود المنتهية'],
  ])}
</div>

<!-- ══════════════════════════════════ SPONSORSHIPS ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 5', { en: 'Sponsorships', ar: 'الرعايات' })}
  ${bilingualDesc(
    'Manage external sponsorship partners and their payment schedules. The dashboard highlights active sponsors and flags agreements approaching expiry so no renewal is missed.',
    'إدارة شركاء الرعاية الخارجيين وجداول دفعاتهم. تُبرز لوحة التحكم الرعاة النشطين وتُنبّه إلى الاتفاقيات المقتربة من انتهاء صلاحيتها حتى لا يُفوَّت أي تجديد.'
  )}
  <div class="tab-label">Sponsorships Tab <span class="tab-label-ar">— علامة الرعايات</span></div>
  <div class="screenshot-wrap">${img(ss.partners)}</div>
  <div class="tab-label" style="margin-top:10px">Payments Tab <span class="tab-label-ar">— علامة المدفوعات</span></div>
  <div class="screenshot-wrap">${img(ss.partnersPayments)}</div>
  ${featureList([
    ['Partner Profiles','Add and edit sponsor details and agreement terms','ملفات الشركاء'],
    ['Payment History','Record and view all sponsorship payments received','سجل المدفوعات'],
    ['Expiry Tracking','Days-remaining badges on all partner cards','تتبع انتهاء الصلاحية'],
    ['Status Badges','Active / Expiring / Expired color-coded indicators','شارات الحالة الملونة'],
  ])}
</div>

<!-- ══════════════════════════════════ REPORTS ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 6', { en: 'Reports', ar: 'التقارير' })}
  ${bilingualDesc(
    'Generate print-ready financial reports across 6 categories. Filter by date range and building. All report views have a dedicated Print button that produces a clean formatted hard copy. (Admin access required)',
    'إنشاء تقارير مالية جاهزة للطباعة عبر 6 فئات. تصفية حسب نطاق التاريخ والمبنى. جميع عروض التقارير لها زر طباعة مخصص. (يتطلب صلاحية المسؤول)'
  )}
  <div class="screenshot-wrap">${img(ss.reports)}</div>
  ${featureList([
    ['Rent Collection','Monthly rent receipts by tenant and building','تحصيل الإيجار الشهري'],
    ['Outstanding Balances','All unpaid amounts across all tenants','المبالغ المستحقة'],
    ['Bills Report','Expense summary for any selected date range','تقرير الفواتير'],
    ['Expiring Leases','Leases expiring within a chosen period','العقود المنتهية'],
    ['P&amp;L Summary','Combined income vs. expense financial view','ملخص الربح والخسارة'],
    ['Sponsorships Report','Sponsorship revenue and partner activity','تقرير الرعايات'],
  ])}
</div>

<!-- ══════════════════════════════════ SETTINGS ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 7', { en: 'Settings', ar: 'الإعدادات' })}
  ${bilingualDesc(
    'System configuration panel available to Admin and Super Admin users. Configure company branding, manage expense categories, buildings, rental units, and user accounts.',
    'لوحة تكوين النظام المتاحة للمسؤولين والمسؤولين الأعلى. تكوين العلامة التجارية للشركة، وإدارة فئات المصروفات والمباني والوحدات وحسابات المستخدمين.'
  )}
  <div class="screenshot-wrap">${img(ss.settings)}</div>
  ${featureList([
    ['Company Branding','Set company name and upload logo','العلامة التجارية للشركة'],
    ['Bill Categories','Create and manage expense categories','فئات المصروفات'],
    ['Buildings','Add and edit building records','إدارة المباني'],
    ['Units','Manage rental units within each building','إدارة الوحدات'],
    ['User Management','Create users and assign Admin / User roles','إدارة المستخدمين والأدوار'],
    ['Data Import','Bulk-import tenant or payment data via CSV','استيراد البيانات بالجملة'],
  ])}
</div>

<!-- ══════════════════════════════════ AUDIT LOGS ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 8', { en: 'Audit Logs', ar: 'سجلات التدقيق' })}
  ${bilingualDesc(
    'A complete, tamper-evident activity trail of every action taken in the system. Records the user, action type, affected resource, and timestamp. Provides full operational accountability. (Super Admin only)',
    'سجل نشاط كامل لكل إجراء يُتخذ في النظام. يسجل المستخدم ونوع الإجراء والمورد المتأثر والطابع الزمني. يوفر مساءلة تشغيلية كاملة. (للمسؤول الأعلى فقط)'
  )}
  <div class="screenshot-wrap">${img(ss.auditLogs)}</div>
</div>

<!-- ══════════════════════════════════ USER GUIDE ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 9', { en: 'User Guide', ar: 'دليل المستخدم' })}

  <div class="guide-section-title">
    How to add a new bill
    <span class="guide-section-title-ar">كيفية إضافة فاتورة جديدة</span>
  </div>
  <div class="steps">
    ${steps([
      [1,'Go to Bills','الذهاب إلى الفواتير','Click "Bills" in the top navigation bar.','انقر على "الفواتير" في شريط التنقل العلوي.'],
      [2,'Select Month','اختيار الشهر','Use the ‹ › arrows to navigate to the target month.','استخدم الأسهم للتنقل إلى الشهر المستهدف.'],
      [3,'Open Form','فتح النموذج','Click the "+ Add Bill" button at the top right.','انقر على زر "+ إضافة فاتورة" في أعلى اليمين.'],
      [4,'Fill Details','تعبئة التفاصيل','Enter bill name, category, amount, and due date.','أدخل اسم الفاتورة والفئة والمبلغ وتاريخ الاستحقاق.'],
      [5,'Save','الحفظ','Click Save. The bill appears in the table immediately.','انقر على حفظ. تظهر الفاتورة في الجدول فورًا.'],
    ])}
  </div>

  <div class="guide-section-title">
    How to record a rent payment
    <span class="guide-section-title-ar">كيفية تسجيل دفعة إيجار</span>
  </div>
  <div class="steps">
    ${steps([
      [1,'Go to Rentals','الذهاب إلى الإيجارات','Click "Rentals" in the top navigation.','انقر على "الإيجارات" في شريط التنقل العلوي.'],
      [2,'Payments Tab','علامة المدفوعات','The Payments tab is selected by default.','علامة المدفوعات محددة افتراضيًا.'],
      [3,'Find Tenant','البحث عن المستأجر','Locate the tenant row in the payments table.','حدد صف المستأجر في جدول المدفوعات.'],
      [4,'Record Payment','تسجيل الدفعة','Click the payment action, enter amount and date received, then save.','انقر على إجراء الدفع، أدخل المبلغ وتاريخ الاستلام، ثم احفظ.'],
    ])}
  </div>

  <div class="guide-section-title">
    How to generate and print a report
    <span class="guide-section-title-ar">كيفية إنشاء تقرير وطباعته</span>
  </div>
  <div class="steps">
    ${steps([
      [1,'Go to Reports','الذهاب إلى التقارير','Click "Reports" in the navigation (Admin only).','انقر على "التقارير" في التنقل (للمسؤولين فقط).'],
      [2,'Select Type','اختيار النوع','Choose a tab: Rent Collection, Bills, Outstanding, etc.','اختر علامة التبويب: تحصيل الإيجار، الفواتير، المستحقة، إلخ.'],
      [3,'Set Date Range','تحديد النطاق الزمني','Set the From and To month selectors.','حدد الشهر "من" والشهر "إلى".'],
      [4,'Print','الطباعة','Click the Print button to print or export as PDF.','انقر على زر الطباعة للطباعة أو التصدير بصيغة PDF.'],
    ])}
  </div>

  <div class="guide-section-title">
    How to add a user account
    <span class="guide-section-title-ar">كيفية إضافة حساب مستخدم</span>
  </div>
  <div class="steps">
    ${steps([
      [1,'Go to Settings','الذهاب إلى الإعدادات','Click "Settings" in the navigation (Admin only).','انقر على "الإعدادات" في التنقل (للمسؤولين فقط).'],
      [2,'Users Tab','علامة المستخدمين','Navigate to the Users section.','انتقل إلى قسم المستخدمين.'],
      [3,'Add User','إضافة مستخدم','Click "+ Add User" and enter name, email, password, and role.','انقر على "+ إضافة مستخدم" وأدخل الاسم والبريد الإلكتروني وكلمة المرور والدور.'],
      [4,'Save','الحفظ','Click Save. The user can now log in immediately.','انقر على حفظ. يمكن للمستخدم تسجيل الدخول فورًا.'],
    ])}
  </div>
</div>

<!-- ══════════════════════════════════ ROLE MATRIX ══════════════════════════════════ -->
<div class="page">
  ${pageHeader('Section 10', { en: 'Role &amp; Access Matrix', ar: 'مصفوفة الأدوار والصلاحيات' })}
  ${bilingualDesc(
    'The system supports three access levels. Super Admin has full system access. Admin can manage data and view reports. User has day-to-day operational access only.',
    'يدعم النظام ثلاثة مستويات وصول. المسؤول الأعلى لديه وصول كامل. المسؤول يمكنه إدارة البيانات وعرض التقارير. المستخدم لديه وصول تشغيلي يومي فقط.'
  )}
  <table>
    <thead>
      <tr>
        <th>Feature / الميزة</th>
        <th class="center">Super Admin</th>
        <th class="center">Admin</th>
        <th class="center">User</th>
      </tr>
    </thead>
    <tbody>
      ${[
        ['Dashboard / لوحة التحكم',           true,  true,  true ],
        ['Bills — View / عرض الفواتير',        true,  true,  true ],
        ['Bills — Add / Edit / إضافة وتعديل', true,  true,  true ],
        ['Bills — Delete / حذف',               true,  true,  false],
        ['Rentals — View / عرض الإيجارات',    true,  true,  true ],
        ['Rentals — Record Payments / تسجيل المدفوعات', true, true, true],
        ['Sponsorships / الرعايات',            true,  true,  true ],
        ['Reports / التقارير',                 true,  true,  false],
        ['Settings / الإعدادات',               true,  true,  false],
        ['User Management / إدارة المستخدمين',true,  true,  false],
        ['Audit Logs / سجلات التدقيق',        true,  false, false],
      ].map(([feat,sa,a,u]) => `
        <tr>
          <td>${feat}</td>
          <td class="center">${sa ? '<span class="check">✓</span>' : '<span class="cross">✕</span>'}</td>
          <td class="center">${a  ? '<span class="check">✓</span>' : '<span class="cross">✕</span>'}</td>
          <td class="center">${u  ? '<span class="check">✓</span>' : '<span class="cross">✕</span>'}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <div style="margin-top:auto;padding-top:18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:12px;font-weight:700;color:#0f172a;">MSA Logistic System</div>
      <div style="font-family:'Noto Sans Arabic',sans-serif;font-size:10.5px;color:#64748b;">نظام إم إس إيه اللوجستي</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:11px;color:#94a3b8;">Designed &amp; Developed by JMLapido</div>
      <div style="font-size:11px;color:#94a3b8;">${dateEn}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px;font-weight:600;color:#2563eb;">Confidential</div>
      <div style="font-size:10.5px;color:#94a3b8;">For Internal Use Only</div>
    </div>
  </div>
</div>

<!-- ══════════════════════════════ BACK COVER ══════════════════════════════ -->
<div class="page back-cover">
  <div style="font-size:28px;font-weight:700;color:#fff;">MSA Logistic System</div>
  <div style="font-family:'Noto Sans Arabic',sans-serif;font-size:20px;color:rgba(255,255,255,.7);">نظام إم إس إيه اللوجستي</div>
  <div style="width:50px;height:2px;background:rgba(255,255,255,.3);border-radius:1px;"></div>
  <div style="font-size:13px;color:rgba(255,255,255,.5);">Property &amp; Rental Management System</div>
  <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:20px;">
    Designed &amp; Developed by JMLapido &nbsp;·&nbsp; ${dateEn} &nbsp;·&nbsp; Version 1.0
  </div>
  <div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:4px;">
    Confidential — For Internal Use Only
  </div>
</div>

</body>
</html>`;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('\n📸 Capturing screenshots…');
  const ss = await captureAll();

  console.log('\n📄 Composing PDF…');
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  const html = buildHTML(ss);
  fs.writeFileSync(TEMP_HTML, html, 'utf-8');

  const fileUrl = 'file:///' + TEMP_HTML.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000); // let fonts finish rendering

  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  });

  await browser.close();
  try { fs.unlinkSync(TEMP_HTML); } catch {}

  const sizeKB = Math.round(fs.statSync(OUTPUT_PDF).size / 1024);
  console.log(`\n✅ PDF saved to:\n   ${OUTPUT_PDF}\n   Size: ${sizeKB} KB\n`);
}

main().catch(err => { console.error('\n❌ Error:', err.message); process.exit(1); });
