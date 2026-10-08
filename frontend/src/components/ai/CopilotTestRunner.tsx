import React, { useState } from 'react';

interface DiagnosticPreset {
    name: string;
    prompt: string;
    expectedOutput: {
        recommendation: string;
        confidenceScore: number;
        businessReasoning: string;
        data_sources: string[];
        riskClassification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    };
}

export const CopilotTestRunner: React.FC = () => {
    const [isRunning, setIsRunning] = useState(false);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [currentPreset, setCurrentPreset] = useState<string>('');

    const diagnosticPresets: DiagnosticPreset[] = [
        {
            name: "Cold Chain Threshold Anomaly",
            prompt: "Analyze cargo temperature fluctuations for Manifest MF-9042.",
            expectedOutput: {
                recommendation: "Route diversion recommended. Transporter refrigerator unit showing erratic voltage drops.",
                confidenceScore: 0.96,
                businessReasoning: "Ambient humidity matrix climbed 14% while core temperature breached critical thresholds (+4.2°C). pgvector spatial match confirms similarity to legacy hardware failure profiles.",
                data_sources: ["iot_telemetry_events", "manifest_stops", "vector_failure_embeddings"],
                riskClassification: "HIGH"
            }
        },
        {
            name: "Payroll Ledger Imbalance",
            prompt: "Run cross-layer compliance audit for HRMS payroll run cycle V-2026.09.",
            expectedOutput: {
                recommendation: "General Ledger voucher posting APPROVED. Double-entry invariants satisfied.",
                confidenceScore: 1.00,
                businessReasoning: "Mathematical verification pass completed: sum of payroll debits exactly matches credit cash outflow allocation. Discrepancy delta equals 0.00 SAR.",
                data_sources: ["hrms_attendance_logs", "finance_journal_lines"],
                riskClassification: "LOW"
            }
        }
    ];

    const triggerTestSimulation = async (preset: DiagnosticPreset) => {
        setIsRunning(true);
        setCurrentPreset(preset.name);
        const startTime = performance.now();

        try {
            // Simulate asynchronous pgvector L2 distance lookup latency
            await new Promise((resolve) => setTimeout(resolve, 850));

            const endTime = performance.now();
            setExecutionTime(Number((endTime - startTime).toFixed(2)));

            // Dispatch payload directly to global window logs for integration tracking
            console.log(`[COPILOT-DIAGNOSTIC-PASS] '${preset.name}' completed inside ${endTime - startTime}ms`, preset.expectedOutput);
        } catch (error) {
            console.error("[COPILOT-DIAGNOSTIC-FAIL] Simulation failed:", error);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg shadow-inner text-slate-200 my-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <h4 className="text-sm font-semibold tracking-wider text-cyan-400 flex items-center gap-2">
                    ⚡ Copilot API Real-Time Test Plane
                </h4>
                <span className="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-400 border border-slate-700">
                    SLA Limit: 15ms
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {diagnosticPresets.map((preset) => (
                    <button
                        key={preset.name}
                        onClick={() => triggerTestSimulation(preset)}
                        disabled={isRunning}
                        className="p-3 text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-all text-xs flex flex-col gap-1 disabled:opacity-50"
                    >
                        <span className="font-semibold text-slate-100">{preset.name}</span>
                        <span className="text-slate-400 italic truncate w-full">"{preset.prompt}"</span>
                    </button>
                ))}
            </div>

            {currentPreset && (
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono space-y-2">
                    <div className="flex justify-between text-slate-400 border-b border-slate-900 pb-1.5">
                        <span>Target: {currentPreset}</span>
                        <span className={isRunning ? "text-amber-400 animate-pulse" : "text-emerald-400"}>
                            {isRunning ? "PROCESSING..." : `COMPLETED in ${executionTime}ms`}
                        </span>
                    </div>

                    {!isRunning && (
                        <div className="space-y-1.5 animate-fadeIn">
                            <p><span className="text-cyan-400">Recommendation:</span> {diagnosticPresets.find(p => p.name === currentPreset)?.expectedOutput.recommendation}</p>
                            <p>
                                <span className="text-cyan-400">Confidence Score:</span>{' '}
                                <span className="text-emerald-400">{(diagnosticPresets.find(p => p.name === currentPreset)?.expectedOutput.confidenceScore! * 100)}%</span>
                            </p>
                            <p><span className="text-cyan-400">Risk Profile:</span> <span className="text-rose-400">{diagnosticPresets.find(p => p.name === currentPreset)?.expectedOutput.riskClassification}</span></p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
