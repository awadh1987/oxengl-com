import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';

// === 1. DATA CONTRACT TYPING ===
interface ChatMessage {
  id: string;
  sender: 'USER' | 'AI';
  text: string;
  timestamp: string;
  structuredData?: {
    recommendation: string;
    confidenceScore: number;
    businessReasoning: string;
    dataSources: string[];
    riskClassification: string;
  };
}

export const AiCopilotView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const { user } = useSelector((state: any) => state.auth);

  // Auto-scroll to track active chat flows fluently
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // === 2. TRANSACTION PIPELINE HANDLER ===
  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isProcessing) return;

    const userMessageId = `msg-${Date.now()}`;
    const currentUserPrompt = inputPrompt;
    
    // Instantiate local User message container record instantly
    const userMessage: ChatMessage = {
      id: userMessageId,
      sender: 'USER',
      text: currentUserPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setIsProcessing(true);

    try {
      // Direct integration routing call through the Vite network reverse proxy gateway
      const response = await fetch('/api/v1/ai/copilot/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': user?.tenantId || 'tenant_001',
          'X-Role': user?.role || 'user'
        },
        body: JSON.stringify({ prompt: currentUserPrompt })
      });

      if (!response.ok) throw new Error('API Execution Disruption');
      
      const payload = await response.json();

      // Instantiate structural explainable AI response context mapping envelope
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'AI',
        text: payload.recommendation,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        structuredData: {
          recommendation: payload.recommendation,
          confidenceScore: payload.confidence_score,
          businessReasoning: payload.business_reasoning,
          dataSources: payload.data_sources,
          riskClassification: payload.risk_classification
        }
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          sender: 'AI',
          text: 'Platform Communication Disruption: Unable to extract semantic reasoning parameters from the network layer.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] bg-slate-900 text-white rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* HEADER SECTION CONTROLS INDICATOR */}
      <div className="bg-slate-950 border-b border-slate-800 p-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-blue-400">OxenGL Cognitive Copilot</h1>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">Secure Multi-Tenant RAG Search Engine Active</p>
        </div>
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
      </div>

      {/* CONVERSATIONAL MESSAGE THREAD WINDOW */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2 text-slate-500">
            <span className="text-3xl">🧠</span>
            <p className="text-sm font-medium">How can I optimize your logistics operations today?</p>
            <p className="text-[10px] max-w-xs font-mono text-slate-600">Try: "Show low stock materials" or "Predict cash flow trends next quarter."</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'} space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-200`}>
            <div className={`max-w-xl rounded-xl p-3 text-sm ${msg.sender === 'USER' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-tl-none'}`}>
              <p>{msg.text}</p>
              
              {/* EXPLAINABLE AI METRICS DATA CARD LAYOUT */}
              {msg.structuredData && (
                <div className="mt-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono text-slate-400">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 border-b border-slate-800 pb-1">
                    <span>AI INSIGHT METRICS</span>
                    <span className={msg.structuredData.confidenceScore > 0.85 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      Confidence: {(msg.structuredData.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div><span className="text-blue-400">Reasoning:</span> {msg.structuredData.businessReasoning}</div>
                  <div><span className="text-amber-400">Data Footprint:</span> {msg.structuredData.dataSources.join(', ')}</div>
                  <div className="flex justify-between items-center pt-1 text-[10px]">
                    <span>Risk Class: <span className="text-emerald-500 font-semibold">{msg.structuredData.riskClassification}</span></span>
                    <span className="text-slate-600">{msg.timestamp}</span>
                  </div>
                </div>
              )}
            </div>
            {!msg.structuredData && <span className="text-[9px] font-mono text-slate-600 px-1">{msg.timestamp}</span>}
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 w-max rounded-xl px-3 py-2 animate-pulse text-xs text-slate-400">
            <span>Thinking... Parsing high-dimensional semantic spaces</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* NATURAL LANGUAGE INPUT INTERFACE CONTROLS FORMS */}
      <form onSubmit={handleQuerySubmit} className="bg-slate-950 border-t border-slate-800 p-3 flex gap-2">
        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          disabled={isProcessing}
          placeholder="Ask Copilot a natural language ERP question..."
          className="flex-1 h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isProcessing || !inputPrompt.trim()}
          className="px-4 h-10 bg-blue-600 hover:bg-blue-500 font-semibold text-sm rounded-lg text-white transition focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-800 disabled:text-slate-600"
        >
          Query Engine
        </button>
      </form>
    </div>
  );
};

# Instructions
Read, parse, and fully execute the final frontend view and system validation tasks detailed inside `docs/blueprints/phase3_onboarding_and_copilot.md`.

# Sub-Tasks
1. FRONTEND: Generate the conversational copilot screen component interface at `frontend/src/views/AiCopilotView.tsx`. Connect its submission fetch hooks to the backend REST route and include the structured explainable AI metrics data cards.
2. SYSTEM ROUTING: Ensure the `'ai-copilot'` sidebar route view is cleanly mounted into `frontend/src/App.tsx` and visible within our navigation framework under the active permission guard keys.
3. COMPILATION CHECK: Verify the absolute system type integrity by running a clean build pipeline:
   `cd frontend && npm run build`
4. RUN SANITY TOOL: Execute `python3 scripts/migration_sanity_check.py` to lock down definitive layout path stability.

Print the complete file staging proofs and final build timing logs.
