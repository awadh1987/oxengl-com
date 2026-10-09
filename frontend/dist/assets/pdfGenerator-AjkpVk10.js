import{P as $,h as S}from"./vendor-pdf-CVFpe80d.js";import{J as B}from"./vendor-sheet-DVOVZIdk.js";function X(t,o){const r=URL.createObjectURL(t),e=document.createElement("a");e.href=r,e.download=o,document.body.appendChild(e),e.click(),document.body.removeChild(e),setTimeout(()=>URL.revokeObjectURL(r),1e4)}const R={"slate-50":"#f8fafc","slate-100":"#f1f5f9","slate-200":"#e2e8f0","slate-300":"#cbd5e1","slate-400":"#94a3b8","slate-500":"#64748b","slate-600":"#475569","slate-700":"#334155","slate-800":"#1e293b","slate-900":"#0f172a","slate-950":"#020617","gray-50":"#f9fafb","gray-100":"#f3f4f6","gray-200":"#e5e7eb","gray-300":"#d1d5db","gray-400":"#9ca3af","gray-500":"#6b7280","gray-600":"#4b5563","gray-700":"#374151","gray-800":"#1f2937","gray-900":"#111827","gray-950":"#030712","neutral-50":"#fafafa","neutral-100":"#f5f5f5","neutral-200":"#e5e5e5","neutral-300":"#d4d4d4","neutral-400":"#a3a3a3","neutral-500":"#737373","neutral-600":"#525252","neutral-700":"#404040","neutral-800":"#262626","neutral-900":"#171717","neutral-950":"#0a0a0a","orange-50":"#fff7ed","orange-100":"#ffedd5","orange-200":"#fed7aa","orange-300":"#fdba74","orange-400":"#fb923c","orange-500":"#f97316","orange-600":"#ea580c","orange-700":"#c2410c","orange-800":"#9a3412","orange-900":"#7c2d12","orange-950":"#431407","emerald-50":"#ecfdf5","emerald-100":"#d1fae5","emerald-200":"#a7f3d0","emerald-300":"#6ee7b7","emerald-400":"#34d399","emerald-500":"#10b981","emerald-600":"#059669","emerald-700":"#047857","emerald-800":"#065f46","emerald-900":"#064e3b","emerald-950":"#022c22","rose-50":"#fff1f2","rose-100":"#ffe4e6","rose-200":"#fecdd3","rose-300":"#fda4af","rose-400":"#fb7185","rose-500":"#f43f5e","rose-600":"#e11d48","rose-700":"#be123c","rose-800":"#9f1239","rose-900":"#881337","rose-950":"#4c0519","amber-50":"#fffbeb","amber-100":"#fef3c7","amber-200":"#fde68a","amber-300":"#fcd34d","amber-400":"#fbbf24","amber-500":"#f59e0b","amber-600":"#d97706","amber-700":"#b45309","amber-800":"#92400e","amber-900":"#78350f","amber-950":"#451a03","blue-50":"#eff6ff","blue-100":"#dbeafe","blue-200":"#bfdbfe","blue-300":"#93c5fd","blue-400":"#60a5fa","blue-500":"#3b82f6","blue-600":"#2563eb","blue-700":"#1d4ed8","blue-800":"#1e40af","blue-900":"#1e3a8a","blue-950":"#172554","red-500":"#ef4444","red-600":"#dc2626","red-700":"#b91c1c"};function F(t,o,r,e=1){const a=t+.3963377774*o+.2158037573*r,n=t-.1055613458*o-.0638541728*r,i=t-.0894841775*o-1.291485548*r,c=a*a*a,d=n*n*n,l=i*i*i,s=4.0767416621*c-3.3077115913*d+.2309699292*l,f=-1.2684380046*c+2.6097574011*d-.3413193965*l,x=-.0041960863*c-.7034186147*d+1.707614701*l,m=C=>{const b=Math.max(0,Math.min(1,C));return b<=.0031308?12.92*b:1.055*Math.pow(b,1/2.4)-.055},u=Math.round(m(s)*255),g=Math.round(m(f)*255),p=Math.round(m(x)*255),k=Math.max(0,Math.min(1,e));return k<1?`rgba(${u}, ${g}, ${p}, ${Number(k.toFixed(3))})`:`rgb(${u}, ${g}, ${p})`}function O(t,o,r,e=1){const a=r*Math.PI/180,n=o*Math.cos(a),i=o*Math.sin(a);return F(t,n,i,e)}function y(t){return t=t.trim(),t.endsWith("%")?parseFloat(t)/100:parseFloat(t)}function V(t){return t=t.trim(),t.endsWith("turn")?parseFloat(t)*360:t.endsWith("rad")?parseFloat(t)*180/Math.PI:(t.endsWith("deg"),parseFloat(t))}function z(t){const o=t.match(/oklab\(\s*([^/)]+)(?:\s*\/\s*([^)]+))?\s*\)/i);if(!o)return null;const r=o[1].trim().split(/\s+/);if(r.length<3)return null;const e=y(r[0]),a=y(r[1]),n=y(r[2]);let i=1;return o[2]&&(i=y(o[2])),isNaN(e)||isNaN(a)||isNaN(n)||isNaN(i)?null:F(e,a,n,i)}function W(t){const o=t.match(/oklch\(\s*([^/)]+)(?:\s*\/\s*([^)]+))?\s*\)/i);if(!o)return null;const r=o[1].trim().split(/\s+/);if(r.length<3)return null;const e=y(r[0]),a=y(r[1]),n=V(r[2]);let i=1;return o[2]&&(i=y(o[2])),isNaN(e)||isNaN(a)||isNaN(n)||isNaN(i)?null:O(e,a,n,i)}let w=null,h=null;function U(t){try{if(typeof document>"u"||(w||(w=document.createElement("canvas"),w.width=1,w.height=1,h=w.getContext("2d",{willReadFrequently:!0})),!h))return null;h.clearRect(0,0,1,1),h.fillStyle="#000000",h.fillStyle=t,h.fillRect(0,0,1,1);const o=h.getImageData(0,0,1,1).data,r=o[0],e=o[1],a=o[2],n=o[3];if(n===0&&t.toLowerCase().includes("transparent"))return"rgba(0, 0, 0, 0)";const i=Number((n/255).toFixed(3));return i<1?`rgba(${r}, ${e}, ${a}, ${i})`:`rgb(${r}, ${e}, ${a})`}catch{return null}}function H(t){const o=t.toLowerCase();for(const[r,e]of Object.entries(R))if(o.includes(r))return e;return o.includes("transparent")?"rgba(0, 0, 0, 0)":o.includes("rose")?"#f43f5e":o.includes("orange")?"#ea580c":o.includes("emerald")?"#059669":o.includes("amber")?"#d97706":o.includes("slate")?"#334155":o.includes("blue")?"#2563eb":"#0f172a"}function _(t){if(!t||t==="transparent"||t==="inherit"||t==="initial"||t==="none"||!t.includes("oklch")&&!t.includes("oklab")&&!t.includes("color-mix")&&!t.includes("lab(")&&!t.includes("lch("))return t;const o=U(t);if(o&&!o.includes("okl"))return o;if(t.includes("oklch")){const r=W(t);if(r)return r}if(t.includes("oklab")){const r=z(t);if(r)return r}return H(t)}function E(t,o){if(!o||typeof o!="string")return o;const r=t.toLowerCase();if(r.includes("shadow"))return o.includes("oklch")||o.includes("oklab")||o.includes("color-mix")||o.includes("lab(")||o.includes("lch(")?"none":o;if(!o.includes("oklch")&&!o.includes("oklab")&&!o.includes("color-mix")&&!o.includes("lab(")&&!o.includes("lch("))return o;if(["color","background-color","backgroundcolor","border-color","bordercolor","border-top-color","bordertopcolor","border-bottom-color","borderbottomcolor","border-left-color","borderleftcolor","border-right-color","borderrightcolor","outline-color","outlinecolor","text-decoration-color","textdecorationcolor","fill","stroke","stop-color","stopcolor"].includes(r)||o.startsWith("okl")||o.startsWith("color-mix"))return _(o);const a=/(?:oklch|oklab|color-mix|lab|lch)\((?:[^()]+|\((?:[^()]+|\([^()]*\))*\))*\)/g;return o.replace(a,n=>_(n))}function Z(t){return new Proxy(t,{get(o,r,e){if(r==="getPropertyValue")return n=>{const i=o.getPropertyValue(n);return E(n,i)};const a=Reflect.get(o,r,o);return typeof r=="string"&&typeof a=="string"?E(r,a):typeof a=="function"?a.bind(o):a}})}function L(t){const r=t.getComputedStyle.bind(t);return new Proxy(r,{apply(e,a,n){const i=Reflect.apply(e,t,n);return Z(i)}})}function D(t){var a;if(!t)return;const o=["color","background-color","border-color","border-top-color","border-bottom-color","border-left-color","border-right-color","outline-color","text-decoration-color","fill","stroke"],r=((a=t.ownerDocument)==null?void 0:a.defaultView)||window,e=[t,...Array.from(t.querySelectorAll("*"))];for(const n of e)if(n instanceof HTMLElement||n instanceof SVGElement){n instanceof HTMLElement&&n.style.boxShadow&&(n.style.boxShadow.includes("okl")||n.style.boxShadow.includes("color-mix"))&&(n.style.boxShadow="none");try{const i=r.getComputedStyle(n);for(const d of o){const l=i.getPropertyValue(d);if(l&&(l.includes("oklch")||l.includes("oklab")||l.includes("color-mix")||l.includes("lab(")||l.includes("lch("))){const s=_(l);n.style.setProperty(d,s,"important")}}const c=i.getPropertyValue("box-shadow");c&&(c.includes("oklch")||c.includes("oklab")||c.includes("color-mix"))&&n.style.setProperty("box-shadow","none","important")}catch{}}}function A(t){var r;try{t.defaultView&&t.defaultView!==window&&(t.defaultView.getComputedStyle=L(t.defaultView))}catch{}try{const e=t.createElement("style");e.id="html2canvas-srgb-fallback-styles",e.textContent=`
      :root, [data-theme], body, #customer-tax-invoice-printable, .printable-ticket-page, #export-print-preview-content, [data-pdf-staging-container="true"] {
        --color-slate-50: #f8fafc !important;
        --color-slate-100: #f1f5f9 !important;
        --color-slate-200: #e2e8f0 !important;
        --color-slate-300: #cbd5e1 !important;
        --color-slate-400: #94a3b8 !important;
        --color-slate-500: #64748b !important;
        --color-slate-600: #475569 !important;
        --color-slate-700: #334155 !important;
        --color-slate-800: #1e293b !important;
        --color-slate-900: #0f172a !important;
        --color-slate-950: #020617 !important;

        --color-orange-50: #fff7ed !important;
        --color-orange-100: #ffedd5 !important;
        --color-orange-200: #fed7aa !important;
        --color-orange-300: #fdba74 !important;
        --color-orange-400: #fb923c !important;
        --color-orange-500: #f97316 !important;
        --color-orange-600: #ea580c !important;
        --color-orange-700: #c2410c !important;
        --color-orange-800: #9a3412 !important;
        --color-orange-900: #7c2d12 !important;
        --color-orange-950: #431407 !important;

        --color-emerald-50: #ecfdf5 !important;
        --color-emerald-100: #d1fae5 !important;
        --color-emerald-200: #a7f3d0 !important;
        --color-emerald-300: #6ee7b7 !important;
        --color-emerald-400: #34d399 !important;
        --color-emerald-500: #10b981 !important;
        --color-emerald-600: #059669 !important;
        --color-emerald-700: #047857 !important;
        --color-emerald-800: #065f46 !important;
        --color-emerald-900: #064e3b !important;
        --color-emerald-950: #022c22 !important;

        --color-rose-50: #fff1f2 !important;
        --color-rose-100: #ffe4e6 !important;
        --color-rose-200: #fecdd3 !important;
        --color-rose-300: #fda4af !important;
        --color-rose-400: #fb7185 !important;
        --color-rose-500: #f43f5e !important;
        --color-rose-600: #e11d48 !important;
        --color-rose-700: #be123c !important;
        --color-rose-800: #9f1239 !important;
        --color-rose-900: #881337 !important;
        --color-rose-950: #4c0519 !important;

        --color-amber-50: #fffbeb !important;
        --color-amber-100: #fef3c7 !important;
        --color-amber-200: #fde68a !important;
        --color-amber-300: #fcd34d !important;
        --color-amber-400: #fbbf24 !important;
        --color-amber-500: #f59e0b !important;
        --color-amber-600: #d97706 !important;
        --color-amber-700: #b45309 !important;
        --color-amber-800: #92400e !important;
        --color-amber-900: #78350f !important;
        --color-amber-950: #451a03 !important;

        --color-neutral-50: #fafafa !important;
        --color-neutral-100: #f5f5f5 !important;
        --color-neutral-200: #e5e5e5 !important;
        --color-neutral-300: #d4d4d4 !important;
        --color-neutral-400: #a3a3a3 !important;
        --color-neutral-500: #737373 !important;
        --color-neutral-600: #525252 !important;
        --color-neutral-700: #404040 !important;
        --color-neutral-800: #262626 !important;
        --color-neutral-900: #171717 !important;
        --color-neutral-950: #0a0a0a !important;
      }

      #customer-tax-invoice-printable,
      .printable-ticket-page,
      #export-print-preview-content,
      [data-pdf-staging-container="true"] {
        background-color: #ffffff !important;
        color: #0f172a !important;
        opacity: 1 !important;
        visibility: visible !important;
        box-shadow: none !important;
      }

      [data-pdf-staging-container="true"] * {
        box-shadow: none !important;
        text-shadow: none !important;
      }
    `,(r=t.head)==null||r.appendChild(e)}catch{}D(t.body),t.querySelectorAll("#customer-tax-invoice-printable, .printable-ticket-page, #export-print-preview-content").forEach(e=>{e.style.backgroundColor="#ffffff",e.style.color="#0f172a",e.style.opacity="1",e.style.visibility="visible",e.style.boxShadow="none"})}function T(t){const o=t.indexOf(","),r=o!==-1?t.slice(o+1):t,e=window.atob(r),a=e.length,n=new Uint8Array(a);for(let i=0;i<a;i++)n[i]=e.charCodeAt(i);return n}async function I(t,o=2,r=960){const e=t||document.getElementById("export-print-preview-content")||document.querySelector(".print-container")||document.getElementById("customer-tax-invoice-printable");if(!e)throw new Error("Element to capture is null or undefined.");const a=document.createElement("div");a.setAttribute("data-pdf-staging-container","true"),a.style.position="absolute",a.style.left="0px",a.style.top="0px",a.style.width=`${r}px`,a.style.zIndex="-1",a.style.opacity="1",a.style.visibility="visible",a.style.pointerEvents="none",a.style.backgroundColor="#ffffff",a.style.transform="none",a.style.overflow="visible",a.style.boxSizing="border-box",a.style.boxShadow="none";const n=e.cloneNode(!0);n.style.display="block",n.style.opacity="1",n.style.visibility="visible",n.style.position="relative",n.style.left="0px",n.style.top="0px",n.style.width="100%",n.style.maxWidth="100%",n.style.margin="0",n.style.transform="none",n.style.backgroundColor="#ffffff",n.style.boxSizing="border-box",n.style.boxShadow="none",n.classList.remove("opacity-0","pointer-events-none","hidden"),D(n),a.appendChild(n),document.body.appendChild(a);try{return await G(n,o)}finally{a.parentNode&&a.parentNode.removeChild(a)}}async function G(t,o=2){const r=window.getComputedStyle;try{return window.getComputedStyle=L(window),(await S(t,{scale:o,useCORS:!0,allowTaint:!1,logging:!1,backgroundColor:"#ffffff",windowWidth:t.scrollWidth||1024,onclone:a=>{A(a)}})).toDataURL("image/png",.95)}catch(e){return console.warn("Standard html2canvas capture failed, attempting resilient fallback mode:",e),(await S(t,{scale:1.5,useCORS:!0,allowTaint:!1,logging:!1,backgroundColor:"#ffffff",onclone:n=>{A(n)}})).toDataURL("image/png",.95)}finally{window.getComputedStyle=r}}async function q(t,o){const r=await I(t,2,960),e=await $.create(),a=595.28,n=841.89,i=T(r),c=await e.embedPng(i),d=c.scaleToFit(a-40,n-40),l=e.addPage([a,n]),s=(a-d.width)/2,f=n-d.height-20;return l.drawImage(c,{x:s,y:f,width:d.width,height:d.height}),await e.save()}async function j(t){const o=await I(t,2,960),r=await $.create(),e=595.28,a=841.89,n=T(o),i=await r.embedPng(n),c=i.scaleToFit(e-40,a-40),d=r.addPage([e,a]),l=(e-c.width)/2,s=a-c.height-20;return d.drawImage(i,{x:l,y:s,width:c.width,height:c.height}),await r.save()}async function Y(t,o=[],r,e){const a=t||document.getElementById("customer-tax-invoice-printable")||document.querySelector(".print-container")||document.getElementById("export-print-preview-content");if(!a)throw new Error("Invoice container element is null or undefined.");e==null||e(10,"جاري تهيئة محرك دمج المستندات الرسمي...");const n=await $.create();n.setTitle(`Tax Invoice ${r.invoiceNumber} - Official Merged Document`),n.setAuthor("OxenGL Enterprise Cloud"),n.setSubject(`Approved Tax Invoice and Supporting Scale Tickets for ${r.customerName}`),n.setKeywords(["Tax Invoice","ZATCA","Scale Tickets","OxenGL",r.invoiceNumber]),n.setCreationDate(new Date);const i=595.28,c=841.89;e==null||e(25,"جاري معالجة وتضمين الفاتورة الضريبية المعتمدة (الصفحة 1)...");const d=await I(a,2,960),l=T(d),s=await n.embedPng(l),f=s.scaleToFit(i-40,c-40);n.addPage([i,c]).drawImage(s,{x:(i-f.width)/2,y:c-f.height-20,width:f.width,height:f.height});const m=Array.isArray(o)?o.filter(Boolean):[],u=m.length;if(u===0)e==null||e(85,"لا توجد مرفقات إضافية محددة للدمج. جاري إنهاء ملف الفاتورة...");else for(let p=0;p<u;p++){const k=Math.round(30+(p+1)/u*60);e==null||e(k,`جاري دمج تذكرة الميزان والإثبات الداعم (${p+1} من ${u})...`);const C=m[p];if(C)try{const b=await I(C,2,960),M=T(b),N=await n.embedPng(M),v=N.scaleToFit(i-40,c-40);n.addPage([i,c]).drawImage(N,{x:(i-v.width)/2,y:c-v.height-20,width:v.width,height:v.height})}catch(b){console.warn(`Could not render ticket page ${p+1}:`,b)}}e==null||e(95,"جاري حفظ وتوقيع ملف PDF النهائي المدمج...");const g=await n.save();return e==null||e(100,"تم إنشاء ملف PDF المدمج بنجاح!"),new Blob([g],{type:"application/pdf"})}async function P(t,o=[],r,e){var l;if(!t)throw new Error("Invoice container element is null or undefined.");e==null||e(10,"جاري إنشاء حزمة الأرشيف المضغوط (ZIP)...");const a=new B;e==null||e(25,"جاري توليد ملف الفاتورة الضريبية المنفصل...");const n=await q(t,r.invoiceNumber);a.file(`${r.invoiceNumber}_Official_Tax_Invoice.pdf`,n);const i=Array.isArray(o)?o.filter(s=>s&&s.element&&s.trip):[],c=i.length;if(c>0){const s=a.folder("Supporting_Scale_Tickets_and_Waybills");for(let f=0;f<c;f++){const x=Math.round(30+(f+1)/c*60),m=i[f];e==null||e(x,`جاري توليد ملف PDF لتذكرة الميزان ${m.trip.scale_ticket_no} (${f+1}/${c})...`);try{const u=await j(m.element),g=(m.trip.scale_ticket_no||`ticket_${f+1}`).replace(/[^a-zA-Z0-9_-]/g,"_"),p=(m.trip.truck_no||"truck").replace(/[^a-zA-Z0-9_-]/g,"_");s==null||s.file(`${g}_Truck_${p}_${m.trip.loading_date||"date"}.pdf`,u)}catch(u){console.warn(`Failed to add ticket ${(l=m.trip)==null?void 0:l.scale_ticket_no} to zip:`,u)}}}e==null||e(95,"جاري ضغط الحزمة وإنشاء ملف ZIP النهائي...");const d=await a.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});return e==null||e(100,"تم تجهيز أرشيف ZIP بنجاح!"),d}export{P as a,T as b,I as c,X as d,Y as g};
